// Código solo de servidor. Acceso a los datos GTFS preprocesados (`scripts/process-gtfs.mts`).
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { TransportModeId } from "@/types/transport";
import type {
  ProcessedRoutes,
  ProcessedServices,
  ProcessedShapes,
  ProcessedStops,
  ProcessedTrips,
  StopSchedule,
} from "@/types/gtfs-processed";

/**
 * Los datos se leen de:
 * - `GTFS_DATA_URL` (producción / Vercel): URL base del almacenamiento (Vercel Blob) donde
 *   `npm run gtfs:upload` deja los JSON, con la misma estructura que `data/gtfs/processed/`.
 * - `data/gtfs/processed/` (desarrollo): si `GTFS_DATA_URL` no está definida.
 */
const LOCAL_DIR = path.resolve(process.cwd(), "data/gtfs/processed");
/** Segundos que Next cachea cada fichero remoto. */
const REVALIDATE_SECONDS = 3600;

/** Lee `<modo>/<file>`; devuelve `null` si no existe. Lanza error ante cualquier otro fallo. */
export async function readProcessed<T>(
  mode: TransportModeId,
  file: string,
): Promise<T | null> {
  const baseUrl = process.env.GTFS_DATA_URL?.replace(/\/+$/, "");

  if (baseUrl) {
    const res = await fetch(`${baseUrl}/${mode}/${file}`, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GTFS ${mode}/${file}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  // turbopackIgnore: la ruta es dinámica y apunta a datos, no a código; sin esto el trazado de
  // ficheros de Next intenta incluir todo `data/` (decenas de miles de ficheros) en el despliegue.
  const full = path.resolve(/* turbopackIgnore: true */ LOCAL_DIR, mode, file);
  if (!full.startsWith(LOCAL_DIR + path.sep))
    throw new Error(`Ruta GTFS no permitida: ${file}`);
  try {
    return JSON.parse(await readFile(full, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export const getStops = (mode: TransportModeId) =>
  readProcessed<ProcessedStops>(mode, "stops.json");
export const getRoutes = (mode: TransportModeId) =>
  readProcessed<ProcessedRoutes>(mode, "routes.json");
export const getShapes = (mode: TransportModeId) =>
  readProcessed<ProcessedShapes>(mode, "shapes.json");
export const getServices = (mode: TransportModeId) =>
  readProcessed<ProcessedServices>(mode, "services.json");
/** Índice de viajes (solo modos con tiempo real por viajes, p. ej. Cercanías). */
export const getTrips = (mode: TransportModeId) =>
  readProcessed<ProcessedTrips>(mode, "trips.json");

/** Horario teórico de una parada. El nombre del fichero lleva el `stop_id` con `encodeURIComponent`. */
export const getSchedule = (mode: TransportModeId, stopId: string) =>
  readProcessed<StopSchedule>(
    mode,
    `schedules/${encodeURIComponent(stopId)}.json`,
  );
