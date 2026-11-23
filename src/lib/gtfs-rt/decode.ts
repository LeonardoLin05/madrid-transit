/**
 * Decodificación de feeds GTFS-Realtime.
 *
 * Los feeds pueden llegar en dos formatos:
 *  - Protocol Buffers (`.pb`, Content-Type `application/x-protobuf` / `application/octet-stream`)
 *  - JSON (misma estructura `FeedMessage`, ya decodificada; p. ej. los de Renfe)
 *
 * TODO: para `.pb` usar `gtfs-realtime-bindings`
 *   (`transit_realtime.FeedMessage.decode(new Uint8Array(buffer))`, ya instalado).
 */

/** Los enteros de 64 bits (timestamps) llegan como texto en JSON. */
type Int64 = number | string;

export interface TranslatedString {
  translation?: { text: string; language?: string }[];
}

export interface TripDescriptor {
  tripId?: string;
  routeId?: string;
  startDate?: string;
  startTime?: string;
  scheduleRelationship?: "SCHEDULED" | "ADDED" | "UNSCHEDULED" | "CANCELED";
}

export interface StopTimeEvent {
  delay?: number;
  time?: Int64;
}

export interface TripUpdate {
  trip: TripDescriptor;
  vehicle?: { id?: string; label?: string };
  stopTimeUpdate?: {
    stopSequence?: number;
    stopId?: string;
    arrival?: StopTimeEvent;
    departure?: StopTimeEvent;
    scheduleRelationship?: "SCHEDULED" | "SKIPPED" | "NO_DATA";
  }[];
  timestamp?: Int64;
  delay?: number;
}

export type VehicleStopStatus = "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";

export interface VehiclePositionEntity {
  trip?: TripDescriptor;
  vehicle?: { id?: string; label?: string };
  position?: {
    latitude: number;
    longitude: number;
    bearing?: number;
    speed?: number;
  };
  currentStatus?: VehicleStopStatus;
  stopId?: string;
  timestamp?: Int64;
}

export interface Alert {
  activePeriod?: { start?: Int64; end?: Int64 }[];
  informedEntity?: {
    agencyId?: string;
    routeId?: string;
    stopId?: string;
    trip?: TripDescriptor;
  }[];
  cause?: string;
  effect?: string;
  headerText?: TranslatedString;
  descriptionText?: TranslatedString;
  url?: TranslatedString;
}

/** Subconjunto de `FeedMessage` que usa la app. Ampliar según se necesite. */
export interface FeedMessage {
  header: { gtfsRealtimeVersion: string; timestamp?: Int64 };
  entity: Array<{
    id: string;
    isDeleted?: boolean;
    tripUpdate?: TripUpdate;
    vehicle?: VehiclePositionEntity;
    alert?: Alert;
  }>;
}

/** Convierte un timestamp POSIX (segundos, número o texto) a milisegundos. */
export function toMillis(value: Int64 | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n * 1000 : undefined;
}

/** Texto de un `TranslatedString`, preferentemente en `language`. */
export function translate(
  text: TranslatedString | undefined,
  language = "es",
): string | undefined {
  const list = text?.translation ?? [];
  return (
    list.find((t) => t.language === language)?.text ?? list[0]?.text
  )?.trim();
}

export async function fetchFeed(
  url: string,
  init?: RequestInit,
): Promise<FeedMessage> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`GTFS-RT ${url} respondió ${res.status}`);

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json") || url.endsWith(".json")) {
    const feed = (await res.json()) as FeedMessage;
    return { ...feed, entity: feed.entity ?? [] };
  }
  return decodeProtobuf(await res.arrayBuffer());
}

export function decodeProtobuf(buffer: ArrayBuffer): FeedMessage {
  void buffer;
  throw new Error(
    "Decodificación protobuf no implementada todavía (ver TODO en decode.ts)",
  );
}
