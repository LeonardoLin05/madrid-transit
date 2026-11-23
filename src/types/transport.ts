/**
 * Tipos de dominio compartidos por toda la app (independientes del formato de origen).
 * Los datos GTFS / GTFS-RT / APIs se normalizan a estos tipos en `src/lib`.
 */

/** Identificador de cada modo de transporte. Coincide con el segmento de URL (`/metro`, `/emt`, ...). */
export type TransportModeId =
  "metro" | "metro-ligero" | "cercanias" | "emt" | "interurbanos";

export interface TransportMode {
  id: TransportModeId;
  /** Nombre visible. */
  name: string;
  /** Descripción corta para la pantalla de selección. */
  description: string;
  /** Color principal del modo (hex). Se expone también como variable CSS. */
  color: string;
  /** Ruta de la pantalla del modo. */
  href: `/${TransportModeId}`;
  /** Icono SVG del modo, en `public/icons/<id>.svg`. */
  icon: `/icons/${TransportModeId}.svg`;
}

/** Campos comunes a las llegadas de cualquier modo. */
export interface ArrivalBase {
  routeId: string;
  /** Nombre corto de la línea (p. ej. "L1", "27", "C-5"). */
  routeShortName: string;
  headsign: string;
  /** Instante estimado de llegada (ISO 8601). */
  expectedAt: string;
  /** Instante según el horario teórico (ISO 8601), si se conoce. */
  scheduledAt?: string;
  /** true si procede de tiempo real; false si es horario teórico (GTFS estático). */
  realtime: boolean;
}

/**
 * Posición del tren de Cercanías respecto a la parada consultada: detenido en ella, llegando
 * (es su próxima parada) o en camino (aún le quedan otras antes).
 */
export type CercaniasTrainStatus = "stopped" | "arriving" | "moving";

/**
 * Datos propios de cada modo, añadidos a `ArrivalBase`.
 * Fuente única de la forma de una llegada: para añadir un dato a un modo, se añade aquí
 * (marcarlo opcional si no todas las fuentes lo ofrecen). Los modos sin datos extra usan `object`.
 */
export interface ArrivalExtras {
  metro: object;
  "metro-ligero": object;
  cercanias: {
    /** Identificador del viaje en el GTFS (`trip_id`). */
    tripId: string;
    /** Número de tren (p. ej. "21303"), si se conoce. */
    trainNumber?: string;
    /** Solo si el tren está localizado (feed de posiciones). */
    status?: CercaniasTrainStatus;
    /** Nombre de la parada en la que está o a la que se dirige el tren, si no es esta. */
    trainStopName?: string;
    /** Vía / andén asignado, si se conoce. */
    platform?: string;
    /** Retraso respecto al horario teórico, en segundos (negativo = adelanto). */
    delaySeconds?: number;
    /** true si el viaje está suprimido. */
    canceled?: boolean;
  };
  emt: object;
  interurbanos: object;
}

/** Una llegada/paso en tiempo real normalizada, tipada según el modo. */
export type Arrival<M extends TransportModeId = TransportModeId> = {
  [K in M]: ArrivalBase & ArrivalExtras[K] & { mode: K };
}[M];

/** Respuesta estándar de `/api/realtime/[mode]?stop=<id>`. */
export interface RealtimeResponse<M extends TransportModeId = TransportModeId> {
  mode: M;
  stopId: string;
  updatedAt: string;
  arrivals: Arrival<M>[];
}

/** Línea que pasa por una parada, lista para mostrarla como insignia. */
export interface StopLine {
  /** Nombre corto de la línea (p. ej. "L1", "27", "C-5"). */
  shortName: string;
  /** Colores de la línea (hex con `#`), si el feed los trae. */
  color?: string;
  textColor?: string;
}

/** Salida teórica (GTFS estático) de una parada, calculada a partir de los horarios preprocesados. */
export interface ScheduledDeparture {
  routeId: string;
  routeShortName: string;
  /** Colores de la línea (hex con `#`), si el feed los trae. */
  color?: string;
  textColor?: string;
  headsign: string;
  /** Hora local de salida, "HH:MM". */
  time: string;
  /** Minutos desde ahora hasta la salida. */
  minutesUntil: number;
  /** true si la salida es después de medianoche (ya de mañana). */
  tomorrow: boolean;
}

/** Estado de un vehículo respecto a `stopId` (equivale a `VehicleStopStatus` de GTFS-RT). */
export type VehicleStopStatus = "stopped" | "incoming" | "in-transit";

/** Posición en tiempo real de un vehículo (tren, autobús…). */
export interface VehiclePosition {
  /** Identificador del vehículo o número de tren. */
  id: string;
  tripId?: string;
  routeId?: string;
  routeShortName?: string;
  /** Colores de la línea (hex con `#`), si se conocen. */
  color?: string;
  textColor?: string;
  headsign?: string;
  lat: number;
  lon: number;
  status?: VehicleStopStatus;
  /** Parada en la que está o a la que se dirige. */
  stopId?: string;
  stopName?: string;
  /** Vía / andén en esa parada, si se conoce. */
  platform?: string;
  /** Retraso actual en segundos, si se conoce. */
  delaySeconds?: number;
  /** Instante de la última posición (ISO 8601). */
  updatedAt?: string;
}

/** Respuesta de `/api/realtime/[mode]/vehicles`. */
export interface VehiclesResponse<M extends TransportModeId = TransportModeId> {
  mode: M;
  updatedAt: string;
  vehicles: VehiclePosition[];
}

/** Aviso o incidencia del servicio. */
export interface ServiceAlert {
  id: string;
  /** Titular, si la fuente lo trae. */
  title?: string;
  text: string;
  /** Inicio y fin de vigencia (ISO 8601), si se conocen. */
  start?: string;
  end?: string;
  /** Líneas afectadas (sin repetir y en orden numérico). */
  lines: StopLine[];
  /** `route_id` afectados (para filtrar por las líneas de una parada). */
  routeIds: string[];
  /** Paradas afectadas, si el aviso las concreta. */
  stops: { id: string; name: string }[];
}

/** Respuesta de `/api/realtime/[mode]/alerts`. */
export interface AlertsResponse<M extends TransportModeId = TransportModeId> {
  mode: M;
  updatedAt: string;
  alerts: ServiceAlert[];
}
