// Código solo de servidor. Datos de un modo listos para dibujarlos en un mapa.
import type { StopLine, TransportModeId } from "@/types/transport";
import { linesOfRoutes } from "./search";
import { getRoutes, getShapes, getStops } from "./store";

export interface MapLine {
  /** `shape_id` (único por trazado). */
  id: string;
  shortName: string;
  /** Hex con `#`. */
  color: string;
  /** Puntos [lat, lon]. */
  points: [number, number][];
  /**
   * Desplazamiento lateral en «carriles» (0 = centrado; -1, 1… a un lado u otro) para que las
   * líneas que comparten vía se vean en paralelo. El mapa lo multiplica por su separación en px.
   */
  offset: number;
}

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Líneas que pasan por la parada (para el filtro del panel de la parada). */
  lines: StopLine[];
}

const FALLBACK_COLOR = "#71717a";
/** Dos trazados son el mismo recorrido (ida y vuelta) si sus extremos distan menos de esto. */
const SAME_ENDPOINT_M = 300;
/** Un punto de una línea está «sobre» otra si dista menos de esto de alguno de sus tramos. */
const SHARED_TRACK_M = 40;
/**
 * Kilómetros en común a partir de los cuales dos líneas se separan. Coincidir solo en la entrada a
 * una estación o en un tramo corto no cuenta: si no, casi todas las de Cercanías «compartirían
 * vía» en Atocha o Chamartín y harían falta demasiados carriles.
 */
const MIN_SHARED_M = 5_000;
/** Tamaño de celda del índice espacial (m). */
const GRID_M = 200;

type XY = [number, number];

/**
 * Trazados de las líneas y paradas de un modo. Los trazados vienen de `shapes.json` (uno por línea
 * y sentido, ya simplificado): se deduplican por `shape_id` y, en una misma línea, se descarta el
 * de vuelta si es el de ida al revés. A las líneas que comparten vía se les asigna un `offset`
 * distinto (ver `assignOffsets`). Las estaciones (agrupaciones de paradas) se omiten.
 * Devuelve `null` si no hay datos para el modo.
 */
export async function getMapData(
  mode: TransportModeId,
): Promise<{ lines: MapLine[]; stops: MapStop[] } | null> {
  const [stops, routes, shapes] = await Promise.all([
    getStops(mode),
    getRoutes(mode),
    getShapes(mode),
  ]);
  if (!stops) return null;

  const lines = new Map<string, MapLine>();
  for (const [routeId, byDirection] of Object.entries(shapes ?? {})) {
    const route = routes?.[routeId];
    const shortName = route?.shortName ?? routeId;
    for (const shape of Object.values(byDirection)) {
      if (lines.has(shape.shapeId)) continue;
      const duplicate = [...lines.values()].some(
        (line) =>
          line.shortName === shortName && sameTrack(line.points, shape.points),
      );
      if (duplicate) continue;
      lines.set(shape.shapeId, {
        id: shape.shapeId,
        shortName,
        color: route?.color ?? FALLBACK_COLOR,
        points: shape.points,
        offset: 0,
      });
    }
  }

  return {
    lines: assignOffsets([...lines.values()]),
    stops: Object.entries(stops)
      .filter(([, stop]) => !stop.station)
      .map(([id, stop]) => ({
        id,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        lines: linesOfRoutes(routes, stop.routes ?? []),
      })),
  };
}

/** Distancia aproximada en metros entre dos puntos [lat, lon] (válida a escala de una ciudad). */
function distance(a: [number, number], b: [number, number]) {
  const k = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 110_540, (a[1] - b[1]) * 111_320 * k);
}

/** ¿Son el mismo recorrido (en el mismo sentido o al revés)? Se comparan los extremos. */
function sameTrack(a: [number, number][], b: [number, number][]) {
  if (!a.length || !b.length) return false;
  const near = (p: [number, number], q: [number, number]) =>
    distance(p, q) < SAME_ENDPOINT_M;
  const [a0, a1, b0, b1] = [a[0], a.at(-1)!, b[0], b.at(-1)!];
  return (near(a0, b1) && near(a1, b0)) || (near(a0, b0) && near(a1, b1));
}

/** Distancia de `p` al segmento `a`-`b` (coordenadas en metros). */
function segmentDistance(p: XY, a: XY, b: XY) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/**
 * Desplazamiento fijo por línea para que las que comparten vía no se tapen:
 * 1. Detecta qué pares de líneas comparten al menos `MIN_SHARED_M` de vía (tramos a menos de
 *    `SHARED_TRACK_M` de la otra) y si los recorren en el mismo sentido.
 * 2. Invierte el trazado de algunas líneas para que las que comparten vía vayan en el mismo
 *    sentido: `line-offset` desplaza a la derecha del sentido de dibujo, y si no, dos líneas con
 *    carriles distintos podrían acabar en el mismo lado.
 * 3. Da a cada línea el primer desplazamiento libre (0, -1, 1, -2…) entre las que comparte vía
 *    (coloreado voraz), teniendo en cuenta los tramos en sentido contrario.
 * El desplazamiento se aplica a toda la línea, también donde va sola.
 */
function assignOffsets(lines: MapLine[]): MapLine[] {
  if (lines.length < 2) return lines;
  const lat0 = lines[0].points[0]?.[0] ?? 0;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = lines.map((l) =>
    l.points.map(([lat, lon]): XY => [lon * kx, lat * 110_540]),
  );

  // Índice espacial: celda → tramos [línea, índice del primer punto].
  const grid = new Map<string, [number, number][]>();
  const cell = (x: number, y: number) =>
    `${Math.floor(x / GRID_M)},${Math.floor(y / GRID_M)}`;
  xy.forEach((pts, li) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [a, b] = [pts[i], pts[i + 1]];
      const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      for (
        let gx = Math.floor(x0 / GRID_M);
        gx <= Math.floor(x1 / GRID_M);
        gx++
      )
        for (
          let gy = Math.floor(y0 / GRID_M);
          gy <= Math.floor(y1 / GRID_M);
          gy++
        ) {
          const key = `${gx},${gy}`;
          const list = grid.get(key) ?? [];
          list.push([li, i]);
          grid.set(key, list);
        }
    }
  });

  // Para cada punto de cada línea: líneas que pasan a menos de `SHARED_TRACK_M` y si van en el
  // mismo sentido (+1) o en el contrario (-1).
  const nearAt = xy.map((pts, li) =>
    pts.map((p, i) => {
      const near = new Map<number, number>();
      const [from, to] =
        i < pts.length - 1 ? [p, pts[i + 1]] : [pts[i - 1] ?? p, p];
      const dir: XY = [to[0] - from[0], to[1] - from[1]];
      const [gx, gy] = cell(p[0], p[1]).split(",").map(Number);
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++)
          for (const [lj, j] of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
            if (lj === li || near.has(lj)) continue;
            const [a, b] = [xy[lj][j], xy[lj][j + 1]];
            if (segmentDistance(p, a, b) > SHARED_TRACK_M) continue;
            near.set(
              lj,
              Math.sign(dir[0] * (b[0] - a[0]) + dir[1] * (b[1] - a[1])),
            );
          }
      return near;
    }),
  );

  // 1. Por cada par: metros en común (tramos con los dos extremos sobre la otra línea, desde la
  // más corta de las dos perspectivas) y balance de sentido ponderado por longitud.
  const shared = new Map<string, { length: number; direction: number }>();
  xy.forEach((pts, li) => {
    const perLine = new Map<number, { length: number; direction: number }>();
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(
        pts[i + 1][0] - pts[i][0],
        pts[i + 1][1] - pts[i][1],
      );
      for (const [lj, sign] of nearAt[li][i]) {
        if (!nearAt[li][i + 1].has(lj)) continue;
        const entry = perLine.get(lj) ?? { length: 0, direction: 0 };
        entry.length += len;
        entry.direction += sign * len;
        perLine.set(lj, entry);
      }
    }
    for (const [lj, { length, direction }] of perLine) {
      const key = li < lj ? `${li}|${lj}` : `${lj}|${li}`;
      const prev = shared.get(key);
      if (!prev || length < prev.length) shared.set(key, { length, direction });
    }
  });

  // Grafo de líneas que comparten vía, con el signo del sentido relativo y su peso (metros netos
  // en ese sentido: un par que va igual en un tramo y al revés en otro pesa poco).
  const neighbors = lines.map(() => new Map<number, 1 | -1>());
  const edges: { a: number; b: number; sign: 1 | -1; weight: number }[] = [];
  for (const [key, { length, direction }] of shared) {
    if (length < MIN_SHARED_M) continue;
    const [a, b] = key.split("|").map(Number);
    const sign = direction >= 0 ? 1 : -1;
    neighbors[a].set(b, sign);
    neighbors[b].set(a, sign);
    edges.push({ a, b, sign, weight: Math.abs(direction) });
  }

  // 2. Orientación: con un único desplazamiento por línea no siempre se puede contentar a todos los
  // pares (p. ej. la C10 va con la C8 en un sentido hacia Villalba y en el contrario entre Atocha y
  // Chamartín). Se fijan primero los pares con más vía en común en un mismo sentido (árbol de
  // máximo peso con union-find que guarda la paridad respecto a la raíz).
  const parent = lines.map((_, i) => i);
  const parity = lines.map(() => 1 as 1 | -1); // orientación respecto al padre
  const find = (i: number): [number, 1 | -1] => {
    if (parent[i] === i) return [i, 1];
    const [root, p] = find(parent[i]);
    parent[i] = root;
    parity[i] = (parity[i] * p) as 1 | -1;
    return [root, parity[i]];
  };
  for (const { a, b, sign } of edges.sort((x, y) => y.weight - x.weight)) {
    const [ra, pa] = find(a);
    const [rb, pb] = find(b);
    if (ra === rb) continue;
    // orient(b) = orient(a) · sign  ⇒  paridad de rb respecto a ra.
    parent[rb] = ra;
    parity[rb] = (pa * sign * pb) as 1 | -1;
  }
  const orient = lines.map((_, i) => find(i)[1]);
  const order = lines
    .map((_, i) => i)
    .sort((a, b) => neighbors[b].size - neighbors[a].size);

  // 3. Carriles, ya como desplazamiento centrado (0, -1, 1, -2, 2…), empezando por las líneas más
  // conectadas. Con una vecina que va en el mismo sentido no se puede repetir su carril; si en
  // algún tramo largo va en sentido contrario, su desplazamiento se ve reflejado (al otro lado),
  // así que tampoco se puede usar el opuesto del suyo.
  const offset = new Array<number | null>(lines.length).fill(null);
  for (const i of order) {
    if (!neighbors[i].size) {
      offset[i] = 0;
      continue;
    }
    const forbidden = new Set<number>();
    for (const j of neighbors[i].keys()) {
      const oj = offset[j];
      if (oj === null) continue;
      const key = i < j ? `${i}|${j}` : `${j}|${i}`;
      const { length, direction } = shared.get(key)!;
      // Sentido relativo tras invertir los trazados.
      const net = direction * orient[i] * orient[j];
      if ((length + net) / 2 >= MIN_SHARED_M) forbidden.add(oj);
      if ((length - net) / 2 >= MIN_SHARED_M) forbidden.add(-oj);
    }
    let candidate = 0;
    for (let k = 1; forbidden.has(candidate); k++)
      candidate = k % 2 ? -Math.ceil(k / 2) : k / 2;
    offset[i] = candidate;
  }

  return lines.map((line, i) => ({
    ...line,
    points: orient[i] === -1 ? [...line.points].reverse() : line.points,
    offset: offset[i] ?? 0,
  }));
}
