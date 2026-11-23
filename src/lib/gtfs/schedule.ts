// Código solo de servidor. Próximas salidas teóricas a partir de los horarios preprocesados.
import type { ScheduledDeparture, TransportModeId } from "@/types/transport";
import type { ProcessedService } from "@/types/gtfs-processed";
import { childStopIds } from "./search";
import { getRoutes, getSchedule, getServices, getStops } from "./store";

const TIMEZONE = "Europe/Madrid";
const DAY = 86400;

/** Fecha y hora actuales en Madrid, con la medianoche local de hoy como referencia en UTC. */
function madridNow(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  return {
    midnightUtc: Date.UTC(parts.year, parts.month - 1, parts.day),
    seconds: parts.hour * 3600 + parts.minute * 60 + parts.second,
  };
}

/** ¿Circula el servicio ese día? `ymd` = YYYYMMDD, `weekday` 0 = lunes. */
function isActive(
  service: ProcessedService,
  ymd: string,
  weekday: number,
): boolean {
  if (service.removed.includes(ymd)) return false;
  if (service.added.includes(ymd)) return true;
  return (
    service.days[weekday] === 1 &&
    (!service.start || service.start <= ymd) &&
    (!service.end || ymd <= service.end)
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const formatTime = (seconds: number) =>
  `${pad(Math.floor((seconds % DAY) / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}`;

/** Paso teórico por una parada, con la fecha ya resuelta. */
export interface UpcomingStopTime {
  /** Segundos desde la medianoche de hoy en Madrid (≥ 86400: mañana; puede ser negativo: ayer). */
  at: number;
  /** Instante del paso (ms desde epoch). */
  epochMs: number;
  /** Hora tal cual está en el horario (comparable entre paradas de un mismo viaje). */
  scheduleSeconds: number;
  /** Parada concreta (en una estación, la hija por la que pasa). */
  stopId: string;
  routeId: string;
  headsign: string;
  /** Solo en modos con `trip_id` en los horarios (Cercanías). */
  tripId?: string;
}

/**
 * Pasos teóricos de una parada a partir de `now - pastSeconds`, ordenados por hora. Si la parada
 * es una estación (tiene paradas hijas), se combinan las de todas ellas. Se consideran los
 * servicios de ayer (salidas pasada la medianoche), hoy y mañana. Devuelve `null` si no hay datos
 * o la parada no existe. `pastSeconds` sirve para incluir trenes que salían hace poco y pueden
 * ir con retraso.
 */
export async function getUpcomingStopTimes(
  mode: TransportModeId,
  stopId: string,
  {
    now = new Date(),
    pastSeconds = 0,
  }: { now?: Date; pastSeconds?: number } = {},
): Promise<{ times: UpcomingStopTime[]; nowSeconds: number } | null> {
  const stops = await getStops(mode);
  if (!stops?.[stopId]) return null;

  const stopIds = [stopId, ...childStopIds(stops, stopId)];
  const [services, routes, ...schedules] = await Promise.all([
    getServices(mode),
    getRoutes(mode),
    ...stopIds.map((id) => getSchedule(mode, id)),
  ]);
  if (!services) return null;

  const { midnightUtc, seconds: nowSeconds } = madridNow(now);
  // Instante real de la medianoche de hoy en Madrid (los horarios GTFS cuentan desde ahí).
  const midnightMs = Math.floor(now.getTime() / 1000 - nowSeconds) * 1000;
  // Qué servicios circulan en cada día relativo a hoy (-1, 0, +1).
  const activeByOffset = new Map<number, Map<string, boolean>>();
  const dateOf = (offset: number) => {
    const date = new Date(midnightUtc + offset * DAY * 1000);
    return {
      ymd: date.toISOString().slice(0, 10).replaceAll("-", ""),
      weekday: (date.getUTCDay() + 6) % 7,
    };
  };
  const active = (offset: number, serviceId: string) => {
    const cache = activeByOffset.get(offset) ?? new Map<string, boolean>();
    activeByOffset.set(offset, cache);
    let value = cache.get(serviceId);
    if (value === undefined) {
      const service = services[serviceId];
      const { ymd, weekday } = dateOf(offset);
      value = service ? isActive(service, ymd, weekday) : false;
      cache.set(serviceId, value);
    }
    return value;
  };

  const from = nowSeconds - pastSeconds;
  const times: UpcomingStopTime[] = [];
  // Distintos viajes pueden coincidir en línea, destino y hora: se muestran una sola vez (salvo
  // que se conozca el viaje, que se necesita para cruzarlo con el tiempo real).
  const seen = new Set<string>();
  schedules.forEach((schedule, i) => {
    if (!schedule) return;
    for (const [time, routeId, headsign, serviceId, tripId] of schedule) {
      for (const offset of [-1, 0, 1]) {
        const at = offset * DAY + time;
        if (at < from || !active(offset, serviceId)) continue;
        const key = tripId
          ? `${offset}|${tripId}`
          : `${at}|${routeId}|${headsign}`;
        if (seen.has(key)) continue;
        seen.add(key);
        times.push({
          at,
          epochMs: midnightMs + at * 1000,
          scheduleSeconds: time,
          stopId: stopIds[i],
          routeId,
          // Vacío en el fichero = nombre largo de la línea (ver `ScheduleEntry`).
          headsign: headsign || routes?.[routeId]?.longName || "",
          tripId,
        });
      }
    }
  });
  times.sort((a, b) => a.at - b.at);
  return { times, nowSeconds };
}

/**
 * Próximas salidas teóricas de una parada (ver `getUpcomingStopTimes`), listas para mostrar.
 * Con `perLine` se devuelven como mucho esas salidas de cada línea (y `limit` en total), para
 * poder filtrar por línea sin quedarse sin resultados.
 */
export async function getNextDepartures(
  mode: TransportModeId,
  stopId: string,
  {
    limit = 15,
    perLine,
    now = new Date(),
  }: { limit?: number; perLine?: number; now?: Date } = {},
): Promise<ScheduledDeparture[] | null> {
  const [upcoming, routes] = await Promise.all([
    getUpcomingStopTimes(mode, stopId, { now }),
    getRoutes(mode),
  ]);
  if (!upcoming) return null;
  const { times, nowSeconds } = upcoming;

  // Sin repetir línea, destino y hora (en los modos con trip_id puede haber duplicados).
  const seen = new Set<string>();
  const perLineCount = new Map<string, number>();
  return times
    .filter(({ at, routeId, headsign }) => {
      const key = `${at}|${routeId}|${headsign}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (perLine === undefined) return true;
      const line = routes?.[routeId]?.shortName ?? routeId;
      const count = perLineCount.get(line) ?? 0;
      perLineCount.set(line, count + 1);
      return count < perLine;
    })
    .slice(0, limit)
    .map(({ at, routeId, headsign }) => {
      const route = routes?.[routeId];
      return {
        routeId,
        routeShortName: route?.shortName ?? routeId,
        color: route?.color,
        textColor: route?.textColor,
        headsign,
        time: formatTime(at),
        minutesUntil: Math.round((at - nowSeconds) / 60),
        tomorrow: at >= DAY,
      };
    });
}

/**
 * Hasta cuándo cubre el calendario del GTFS de un modo (`YYYYMMDD`) y si ya caducó.
 * Útil para avisar cuando los datos descargados están desactualizados.
 */
export async function getFeedStatus(
  mode: TransportModeId,
  now = new Date(),
): Promise<{ validUntil: string; expired: boolean } | null> {
  const services = await getServices(mode);
  if (!services) return null;
  const dates = Object.values(services)
    .flatMap((s) => [s.end, ...s.added])
    .filter(Boolean);
  if (!dates.length) return null;
  const validUntil = dates.reduce((a, b) => (a > b ? a : b));
  const today = new Date(madridNow(now).midnightUtc)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  return { validUntil, expired: validUntil < today };
}
