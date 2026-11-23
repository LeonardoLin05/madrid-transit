// Código solo de servidor. Tiempo real de Cercanías a partir de los feeds GTFS-RT (JSON) de Renfe.
import {
  fetchFeed,
  type FeedMessage,
  type TripUpdate,
  type VehiclePositionEntity,
  toMillis,
  translate,
} from "@/lib/gtfs-rt/decode";
import { getUpcomingStopTimes } from "@/lib/gtfs/schedule";
import { linesOfRoutes } from "@/lib/gtfs/search";
import { getRoutes, getSchedule, getStops, getTrips } from "@/lib/gtfs/store";
import type {
  ProcessedRoutes,
  ProcessedStops,
  ProcessedTrips,
} from "@/types/gtfs-processed";
import type {
  Arrival,
  CercaniasTrainStatus,
  ServiceAlert,
  VehiclePosition,
  VehicleStopStatus,
} from "@/types/transport";
import { NotFoundError } from "../errors";
import type { RealtimeProvider } from "../index";

const MODE = "cercanias" as const;

/**
 * Feeds de Renfe (todos los núcleos de Cercanías de España; se filtran los de Madrid cruzándolos
 * con el GTFS del CRTM, cuyos `trip_id`, `stop_id` y `route_id` coinciden). Se pueden sustituir
 * con variables de entorno.
 */
const feedUrls = () => ({
  tripUpdates:
    process.env.GTFSRT_CERCANIAS_TRIP_UPDATES_URL ||
    "https://gtfsrt.renfe.com/trip_updates.json",
  vehicles:
    process.env.GTFSRT_CERCANIAS_VEHICLE_POSITIONS_URL ||
    "https://gtfsrt.renfe.com/vehicle_positions.json",
  alerts:
    process.env.GTFSRT_CERCANIAS_ALERTS_URL ||
    "https://gtfsrt.renfe.com/alerts.json",
});

/** Segundos que Next cachea cada feed (todas las peticiones comparten la misma descarga). */
const REVALIDATE = { tripUpdates: 15, vehicles: 15, alerts: 60 };

/** Hasta cuánto antes de ahora se buscan trenes (los muy retrasados siguen pendientes). */
const LOOKBACK_SECONDS = 2 * 3600;
/** Horizonte de llegadas que se devuelven. */
const HORIZON_SECONDS = 4 * 3600;
/** Margen para seguir mostrando un tren cuya hora estimada acaba de pasar. */
const GRACE_MS = 60_000;
const MAX_ARRIVALS = 300;
const MAX_PER_LINE = 15;

const getFeed = (key: keyof typeof REVALIDATE) =>
  fetchFeed(feedUrls()[key], { next: { revalidate: REVALIDATE[key] } });

/** Vía en la etiqueta del vehículo: "C2-21793-PLATF.(5)" → "5". */
const platformOf = (label?: string) =>
  label?.match(/PLATF\.\(([^)]+)\)/)?.[1]?.trim() || undefined;
/** Línea en la etiqueta del vehículo: "C4a-20319" → "C4a". */
const lineOfLabel = (label?: string) => label?.split("-")[0] || undefined;
/** Número de tren: "1026L20319C4a" (servicio + tren + línea) o la etiqueta del vehículo. */
const trainNumberOf = (vehicle?: VehiclePositionEntity, tripId?: string) =>
  vehicle?.vehicle?.id ||
  vehicle?.vehicle?.label?.split("-")[1] ||
  tripId?.match(/^\d{4}[A-Z](\d+)/)?.[1];

const iso = (ms: number | undefined) =>
  ms === undefined ? undefined : new Date(ms).toISOString();

function tripRoute(trips: ProcessedTrips | null, tripId: string | undefined) {
  const entry = tripId ? trips?.[tripId] : undefined;
  if (entry === undefined) return undefined;
  return typeof entry === "string"
    ? { routeId: entry, headsign: undefined }
    : { routeId: entry[0], headsign: entry[1] };
}

function indexTripUpdates(feed: FeedMessage | null) {
  const map = new Map<string, TripUpdate>();
  for (const { tripUpdate } of feed?.entity ?? []) {
    const id = tripUpdate?.trip.tripId;
    if (id) map.set(id, tripUpdate);
  }
  return map;
}

function indexVehicles(feed: FeedMessage | null) {
  const map = new Map<string, VehiclePositionEntity>();
  for (const { vehicle } of feed?.entity ?? []) {
    const id = vehicle?.trip?.tripId;
    if (id) map.set(id, vehicle);
  }
  return map;
}

/** Retraso actual de un viaje, en segundos. */
const delayOf = (tu: TripUpdate | undefined) =>
  tu?.delay ??
  tu?.stopTimeUpdate?.find((s) => s.arrival?.delay !== undefined)?.arrival
    ?.delay ??
  tu?.stopTimeUpdate?.find((s) => s.departure?.delay !== undefined)?.departure
    ?.delay;

/**
 * Hora teórica (segundos del horario) de un viaje en una parada, leyendo el horario de esa parada.
 * Sirve para saber si un tren ya pasó por la consultada. Memoriza las lecturas de cada petición.
 */
function scheduleLookup() {
  const cache = new Map<string, Promise<Map<string, number> | null>>();
  return async (stopId: string, tripId: string) => {
    let byTrip = cache.get(stopId);
    if (!byTrip) {
      byTrip = getSchedule(MODE, stopId).then(
        (schedule) =>
          schedule &&
          new Map(
            schedule.flatMap(([time, , , , id]) =>
              id ? [[id, time] as const] : [],
            ),
          ),
      );
      cache.set(stopId, byTrip);
    }
    return (await byTrip)?.get(tripId);
  };
}

function trainStatus(
  vehicle: VehiclePositionEntity | undefined,
  stopId: string,
): CercaniasTrainStatus | undefined {
  if (!vehicle) return undefined;
  if (vehicle.stopId !== stopId) return "moving";
  return vehicle.currentStatus === "STOPPED_AT" ? "stopped" : "arriving";
}

async function getArrivals(stopId: string) {
  const now = new Date();
  const [upcoming, routes, stops, tuFeed, vpFeed] = await Promise.all([
    getUpcomingStopTimes(MODE, stopId, {
      now,
      pastSeconds: LOOKBACK_SECONDS,
    }),
    getRoutes(MODE),
    getStops(MODE),
    getFeed("tripUpdates").catch(logFeedError("trip_updates")),
    getFeed("vehicles").catch(logFeedError("vehicle_positions")),
  ]);
  if (!upcoming || !stops) throw new NotFoundError(`Parada ${stopId}`);
  if (!tuFeed && !vpFeed)
    throw new Error("No se pudo consultar ningún feed de Renfe");

  const tripUpdates = indexTripUpdates(tuFeed);
  const vehicles = indexVehicles(vpFeed);
  const scheduledAt = scheduleLookup();
  const nowMs = now.getTime();
  const untilSeconds = upcoming.nowSeconds + HORIZON_SECONDS;

  const candidates = upcoming.times.filter((t) => t.at <= untilSeconds);
  const arrivals = await Promise.all(
    candidates.map(async (t): Promise<Arrival<"cercanias"> | null> => {
      const tu = t.tripId ? tripUpdates.get(t.tripId) : undefined;
      const vehicle = t.tripId ? vehicles.get(t.tripId) : undefined;
      const live = Boolean(tu || vehicle);
      // Sin tiempo real, solo cuentan las salidas que aún no han pasado según el horario.
      if (!live && t.epochMs < nowMs) return null;

      const stu = tu?.stopTimeUpdate?.find((s) => s.stopId === t.stopId);
      const exactMs = toMillis(
        stu?.arrival?.time ?? stu?.departure?.time,
      );
      let delaySeconds = delayOf(tu);
      let expectedMs = t.epochMs;
      if (exactMs !== undefined) {
        expectedMs = exactMs;
        delaySeconds = Math.round((exactMs - t.epochMs) / 1000);
      } else if (delaySeconds !== undefined) {
        expectedMs += delaySeconds * 1000;
      }

      const status = trainStatus(vehicle, t.stopId);
      if (expectedMs < nowMs - GRACE_MS && status !== "stopped") return null;
      // Si el tren ya está más allá de esta parada (su parada actual va después en el horario),
      // ya pasó aunque la estimación diga lo contrario.
      if (
        status === "moving" &&
        t.epochMs < nowMs &&
        vehicle?.stopId &&
        t.tripId
      ) {
        const atVehicleStop = await scheduledAt(vehicle.stopId, t.tripId);
        if (atVehicleStop !== undefined && atVehicleStop > t.scheduleSeconds)
          return null;
      }

      const route = routes?.[t.routeId];
      const canceled =
        tu?.trip.scheduleRelationship === "CANCELED" ||
        stu?.scheduleRelationship === "SKIPPED";
      return {
        mode: MODE,
        routeId: t.routeId,
        routeShortName: route?.shortName ?? t.routeId,
        headsign: t.headsign,
        expectedAt: new Date(expectedMs).toISOString(),
        scheduledAt: new Date(t.epochMs).toISOString(),
        realtime: live,
        tripId: t.tripId ?? "",
        trainNumber: trainNumberOf(vehicle, t.tripId),
        status,
        trainStopName:
          status === "moving" && vehicle?.stopId
            ? stops[vehicle.stopId]?.name
            : undefined,
        platform:
          vehicle?.stopId === t.stopId
            ? platformOf(vehicle.vehicle?.label)
            : undefined,
        delaySeconds,
        ...(canceled && { canceled }),
      };
    }),
  );

  const perLine = new Map<string, number>();
  return {
    mode: MODE,
    stopId,
    updatedAt: now.toISOString(),
    arrivals: arrivals
      .filter((a) => a !== null)
      .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt))
      .filter((a) => {
        const count = perLine.get(a.routeShortName) ?? 0;
        perLine.set(a.routeShortName, count + 1);
        return count < MAX_PER_LINE;
      })
      .slice(0, MAX_ARRIVALS),
  };
}

const VEHICLE_STATUS: Record<string, VehicleStopStatus> = {
  STOPPED_AT: "stopped",
  INCOMING_AT: "incoming",
  IN_TRANSIT_TO: "in-transit",
};

async function getVehicles() {
  const [vpFeed, tuFeed, trips, routes, stops] = await Promise.all([
    getFeed("vehicles"),
    getFeed("tripUpdates").catch(logFeedError("trip_updates")),
    getTrips(MODE),
    getRoutes(MODE),
    getStops(MODE),
  ]);
  const tripUpdates = indexTripUpdates(tuFeed);

  const vehicles: VehiclePosition[] = [];
  for (const { id, vehicle: v } of vpFeed.entity) {
    if (!v?.position) continue;
    const tripId = v.trip?.tripId;
    const trip = tripRoute(trips, tripId);
    // Solo trenes del núcleo de Madrid: viaje del GTFS del CRTM o parada de Madrid.
    if (!trip && !(v.stopId && stops?.[v.stopId])) continue;

    const route = trip ? routes?.[trip.routeId] : undefined;
    const tu = tripId ? tripUpdates.get(tripId) : undefined;
    vehicles.push({
      id: trainNumberOf(v, tripId) ?? id,
      tripId,
      routeId: trip?.routeId,
      routeShortName: route?.shortName ?? lineOfLabel(v.vehicle?.label),
      color: route?.color,
      textColor: route?.textColor,
      headsign: trip?.headsign ?? route?.longName,
      lat: v.position.latitude,
      lon: v.position.longitude,
      status: v.currentStatus ? VEHICLE_STATUS[v.currentStatus] : undefined,
      stopId: v.stopId,
      stopName: v.stopId ? stops?.[v.stopId]?.name : undefined,
      platform: platformOf(v.vehicle?.label),
      delaySeconds: delayOf(tu),
      updatedAt: iso(toMillis(v.timestamp)),
    });
  }

  return {
    mode: MODE,
    updatedAt: iso(toMillis(vpFeed.header.timestamp)) ?? new Date().toISOString(),
    vehicles,
  };
}

/** Quita la etiqueta inicial de Renfe ("#MadC5 …", "#MadC2c. …"); las líneas ya se muestran aparte. */
const cleanAlertText = (text: string) =>
  text.replace(/^#\S+?[.:,]?\s+/, "").trim();

function toAlert(
  id: string,
  alert: NonNullable<FeedMessage["entity"][number]["alert"]>,
  routes: ProcessedRoutes | null,
  stops: ProcessedStops | null,
  nowMs: number,
): ServiceAlert | null {
  const entities = alert.informedEntity ?? [];
  const routeIds = [
    ...new Set(
      entities.flatMap((e) =>
        e.routeId && routes?.[e.routeId] ? [e.routeId] : [],
      ),
    ),
  ];
  const stopIds = [
    ...new Set(
      entities.flatMap((e) => (e.stopId && stops?.[e.stopId] ? [e.stopId] : [])),
    ),
  ];
  // Solo los avisos del núcleo de Madrid.
  if (!routeIds.length && !stopIds.length) return null;

  const periods = alert.activePeriod ?? [];
  const starts = periods.map((p) => toMillis(p.start)).filter((n) => n !== undefined);
  const ends = periods.map((p) => toMillis(p.end));
  // Sin fin en algún periodo = vigente hasta nuevo aviso.
  const end = ends.length && ends.every((e) => e !== undefined)
    ? Math.max(...(ends as number[]))
    : undefined;
  if (end !== undefined && end < nowMs) return null;

  const text = cleanAlertText(translate(alert.descriptionText) ?? "");
  const title = translate(alert.headerText);
  if (!text && !title) return null;
  return {
    id,
    title: title ? cleanAlertText(title) : undefined,
    text,
    start: iso(starts.length ? Math.min(...starts) : undefined),
    end: iso(end),
    lines: linesOfRoutes(routes, routeIds),
    routeIds,
    stops: stopIds.map((stopId) => ({ id: stopId, name: stops![stopId].name })),
  };
}

async function getAlerts() {
  const [feed, routes, stops] = await Promise.all([
    getFeed("alerts"),
    getRoutes(MODE),
    getStops(MODE),
  ]);
  const nowMs = Date.now();
  const alerts = feed.entity
    .flatMap(({ id, alert }) =>
      alert ? [toAlert(id, alert, routes, stops, nowMs)] : [],
    )
    .filter((a) => a !== null)
    // Más recientes primero.
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));
  return {
    mode: MODE,
    updatedAt: iso(toMillis(feed.header.timestamp)) ?? new Date().toISOString(),
    alerts,
  };
}

function logFeedError(name: string) {
  return (err: unknown) => {
    console.error(`[realtime:cercanias] ${name}`, err);
    return null;
  };
}

// `satisfies` (y no una anotación) conserva los métodos opcionales como obligatorios, para poder
// llamarlos directamente desde Server Components de Cercanías.
export const cercaniasProvider = {
  getArrivals,
  getVehicles,
  getAlerts,
} satisfies RealtimeProvider<"cercanias">;
