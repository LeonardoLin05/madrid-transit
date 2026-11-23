// Código solo de servidor. Búsqueda de paradas sobre los datos preprocesados.
import type { StopLine, TransportModeId } from "@/types/transport";
import type { ProcessedRoutes, ProcessedStops } from "@/types/gtfs-processed";
import { getRoutes, getStops } from "./store";

export interface StopSearchResult {
  id: string;
  name: string;
  /** Código público de la parada (p. ej. el número de parada de EMT). */
  code?: string;
  /** Líneas que pasan por la parada (o por cualquiera de las de la estación). */
  lines: StopLine[];
}

/** Minúsculas y sin acentos, para comparar sin importar tildes. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Estación a la que pertenece una parada: su `parent_station` si existe en los datos o, en los
 * feeds del CRTM, la estación `est_X_N` homóloga de `par_X_N` (Metro y Metro Ligero).
 */
export function stationOf(
  stops: ProcessedStops,
  stopId: string,
): string | undefined {
  const stop = stops[stopId];
  if (!stop || stop.station) return undefined;
  if (stop.parent && stops[stop.parent]) return stop.parent;
  if (stopId.startsWith("par_")) {
    const station = `est_${stopId.slice(4)}`;
    if (stops[station]?.station) return station;
  }
  return undefined;
}

/** `stop_id` de las paradas de una estación (vacío si no es estación). */
export function childStopIds(
  stops: ProcessedStops,
  stationId: string,
): string[] {
  return Object.keys(stops).filter((id) => stationOf(stops, id) === stationId);
}

/**
 * Líneas de los `route_id` dados, sin repetir (Cercanías tiene un `route_id` por sentido) y
 * ordenadas por nombre con orden numérico ("2" antes que "10").
 */
export function linesOfRoutes(
  routes: ProcessedRoutes | null,
  routeIds: Iterable<string>,
): StopLine[] {
  const byName = new Map<string, StopLine>();
  for (const routeId of routeIds) {
    const route = routes?.[routeId];
    const shortName = route?.shortName || routeId;
    if (!byName.has(shortName)) {
      byName.set(shortName, {
        shortName,
        color: route?.color,
        textColor: route?.textColor,
      });
    }
  }
  return [...byName.values()].sort((a, b) =>
    a.shortName.localeCompare(b.shortName, "es", { numeric: true }),
  );
}

/** Líneas que pasan por las paradas dadas (ver `linesOfRoutes`). */
function linesOf(
  stops: ProcessedStops,
  routes: ProcessedRoutes | null,
  stopIds: string[],
): StopLine[] {
  return linesOfRoutes(
    routes,
    stopIds.flatMap((id) => stops[id]?.routes ?? []),
  );
}

/** Líneas de una parada o estación (la unión de las de sus paradas). `null` si no hay datos. */
export async function getStopLines(
  mode: TransportModeId,
  stopId: string,
): Promise<StopLine[] | null> {
  const [stops, routes] = await Promise.all([getStops(mode), getRoutes(mode)]);
  if (!stops?.[stopId]) return null;
  return linesOf(stops, routes, [stopId, ...childStopIds(stops, stopId)]);
}

/**
 * Busca paradas por nombre o código. Si una parada pertenece a una estación (p. ej. Metro: una
 * parada por línea), solo se devuelve la estación; las estaciones sin paradas se omiten.
 * Devuelve `null` si no hay datos para el modo.
 */
export async function searchStops(
  mode: TransportModeId,
  query: string,
  limit = 30,
): Promise<StopSearchResult[] | null> {
  const [stops, routes] = await Promise.all([getStops(mode), getRoutes(mode)]);
  if (!stops) return null;
  const q = normalize(query);
  if (!q) return [];

  const children = new Map<string, string[]>();
  for (const id of Object.keys(stops)) {
    const station = stationOf(stops, id);
    if (station) children.set(station, [...(children.get(station) ?? []), id]);
  }

  const scored: { result: StopSearchResult; score: number }[] = [];
  for (const [id, stop] of Object.entries(stops)) {
    if (stationOf(stops, id)) continue;
    if (stop.station && !children.has(id)) continue;
    const name = normalize(stop.name);
    const score =
      stop.code === query.trim() || id === query.trim()
        ? 0
        : name.startsWith(q)
          ? 1
          : name.includes(q)
            ? 2
            : -1;
    if (score >= 0) {
      const lines = linesOf(stops, routes, [id, ...(children.get(id) ?? [])]);
      scored.push({
        result: { id, name: stop.name, code: stop.code, lines },
        score,
      });
    }
  }
  return scored
    .sort(
      (a, b) =>
        a.score - b.score || a.result.name.localeCompare(b.result.name, "es"),
    )
    .slice(0, limit)
    .map((s) => s.result);
}
