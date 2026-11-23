/**
 * Formato de los JSON que genera `scripts/process-gtfs.mts` en `data/gtfs/processed/<modo>/`.
 * Si se cambia el script, actualizar aquí.
 */

export interface ProcessedStop {
  name: string;
  lat: number;
  lon: number;
  code?: string;
  /** `stop_id` de la estación padre, si la hay. */
  parent?: string;
  /** true si es una estación (`location_type` 1): agrupa paradas y no tiene horario propio. */
  station?: true;
  /** `route_id` de las líneas que pasan por la parada (ordenados). */
  routes?: string[];
}
/** `stops.json` */
export type ProcessedStops = Record<string, ProcessedStop>;

export interface ProcessedRoute {
  shortName: string;
  longName: string;
  /** Hex con `#` (p. ej. "#2DBEF0"). */
  color?: string;
  textColor?: string;
  /** `route_type` de GTFS (0 tranvía, 1 metro, 2 tren, 3 autobús…). */
  type: number;
}
/** `routes.json` */
export type ProcessedRoutes = Record<string, ProcessedRoute>;

export interface ProcessedShape {
  shapeId: string;
  /** Puntos [lat, lon] ya simplificados. */
  points: [number, number][];
}
/** `shapes.json`: `route_id` → `direction_id` ("0" si el feed no lo trae) → trazado. */
export type ProcessedShapes = Record<string, Record<string, ProcessedShape>>;

export interface ProcessedService {
  /** Lunes a domingo (1 = circula). */
  days: number[];
  /** `YYYYMMDD` */
  start: string;
  end: string;
  /** Fechas `YYYYMMDD` añadidas / excluidas (`calendar_dates.txt`). */
  added: string[];
  removed: string[];
}
/** `services.json` */
export type ProcessedServices = Record<string, ProcessedService>;

/**
 * Paso teórico por una parada: [segundos desde medianoche (puede ser ≥ 86400), route_id, headsign,
 * service_id, trip_id?]. El headsign va vacío (`""`) cuando es el nombre largo de la línea
 * (`routes.json`); `getUpcomingStopTimes` lo resuelve. El `trip_id` solo está en los modos con
 * tiempo real por viajes (`TRIP_ID_MODES` en el script; hoy, Cercanías).
 */
export type ScheduleEntry =
  | [number, string, string, string]
  | [number, string, string, string, string];
/** `schedules/<stop_id>.json`, ordenado por hora. */
export type StopSchedule = ScheduleEntry[];

/**
 * `trips.json` (solo modos de `TRIP_ID_MODES`): `trip_id` → `route_id`, o `[route_id, headsign]`
 * si el destino no es el nombre largo de la línea.
 */
export type ProcessedTrips = Record<string, string | [string, string]>;
