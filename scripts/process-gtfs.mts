/**
 * Preprocesa los GTFS de `data/gtfs/raw/<modo>/` a JSON compactos en `data/gtfs/processed/<modo>/`.
 * Uso:
 *   npm run gtfs:process                      # todos los modos que haya en raw/, con horarios
 *   npm run gtfs:process -- metro emt         # solo esos modos
 *   npm run gtfs:process -- --no-schedules    # omite horarios teóricos (mucho más rápido y ligero)
 *
 * Los JSON se escriben compactos (sin espacios ni saltos de línea) para que pesen lo mínimo:
 * Next solo cachea respuestas de hasta 2 MB (ver `src/lib/gtfs/store.ts`).
 *
 * Salida por modo:
 *   stops.json      { [stop_id]: { name, lat, lon, code?, parent?, station?, routes? } }
 *                   `routes`: route_id de las líneas que pasan por la parada.   (sin accesos de estación)
 *   routes.json     { [route_id]: { shortName, longName, color?, textColor?, type } }
 *                   longName con los guiones que separan estaciones sustituidos por « → ».
 *   shapes.json     { [route_id]: { [direction_id]: { shapeId, points: [lat, lon][] } } }
 *                   un trazado por línea y sentido (el más usado), simplificado.
 *                   Si el feed no trae direction_id (p. ej. Cercanías) se usa "0".
 *   services.json    { [service_id]: { days: [lun..dom], start, end, added[], removed[] } }
 *   schedules/<stop_id>.json   [segundosDesdeMedianoche, route_id, headsign, service_id, trip_id?][]
 *                   headsign "" = el nombre largo de la línea (routes.json), para ahorrar espacio.
 *                   un fichero por parada (nombre con encodeURIComponent), ordenado por hora; las horas pueden superar 86400 (servicio de madrugada).
 *                   `trip_id` solo en los modos de `TRIP_ID_MODES` (cruce con GTFS-Realtime).
 *   trips.json      { [trip_id]: route_id | [route_id, headsign] }   solo en los modos de `TRIP_ID_MODES`;
 *                   el destino se omite si coincide con el nombre largo de la línea.
 *
 * Los ficheros se leen en streaming porque `stop_times.txt` / `shapes.txt` pueden pesar cientos de MB.
 */
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

const RAW_DIR = path.resolve(import.meta.dirname, "../data/gtfs/raw");
const OUT_DIR = path.resolve(import.meta.dirname, "../data/gtfs/processed");

/** Tolerancia de simplificación de los trazados, en grados (~5 m). */
const SHAPE_TOLERANCE = 0.00005;
/** Decimales de las coordenadas (5 ≈ 1 m). */
const COORD_DECIMALS = 5;

/**
 * Modos con tiempo real basado en viajes (GTFS-RT trip updates / vehicle positions): sus horarios
 * llevan el `trip_id` y se genera `trips.json`, para cruzar el feed en vivo con el horario teórico.
 * En el resto se omite porque multiplicaría el tamaño de los horarios (EMT, interurbanos).
 */
const TRIP_ID_MODES = new Set(["cercanias"]);

type Row = Record<string, string>;
type ScheduleRow =
  [number, string, string, string] | [number, string, string, string, string];

// ───────────────────────── Lectura de CSV ─────────────────────────

/** Separa una línea CSV respetando comillas ("a,b", "" escapadas). */
function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",");
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Itera las filas de un CSV como objetos cabecera → valor (admite BOM y CRLF). */
async function* readCsv(file: string): AsyncGenerator<Row> {
  const lines = createInterface({
    input: createReadStream(file, "utf8"),
    crlfDelay: Infinity,
  });
  let header: string[] | null = null;
  for await (const raw of lines) {
    const line = header ? raw : raw.replace(/^﻿/, "");
    if (!line) continue;
    const cells = splitCsvLine(line);
    if (!header) {
      header = cells.map((h) => h.trim());
      continue;
    }
    const row: Row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    yield row;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// ───────────────────────── Utilidades ─────────────────────────

const round = (n: number) => Number(n.toFixed(COORD_DECIMALS));
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * Sustituye por « → » los guiones que separan una estación de otra en el nombre de una línea,
 * dejando un espacio a cada lado. Los guiones que forman parte del nombre de una estación
 * ("Aeropuerto-T4", "Chamartín - Clara Campoamor") se respetan; para distinguirlos se usa el
 * primer criterio que encuentre separadores (se ignoran los guiones entre paréntesis):
 *   1. guion con espacio antes y no después: "Principe Pio -Aeropuerto-T4" (Cercanías);
 *   2. guion con espacio a ambos lados: "Plaza de Cristo Rey - Prosperidad" (EMT, Metro Ligero);
 *   3. cualquier guion: "Pinar de Chamartín-Valdecarros" (Metro, interurbanos).
 * Si un separador deja un lado vacío ("-El Escorial", "Cercedilla -"), no se modifica el nombre.
 */
function withArrows(name: string): string {
  const hyphens: number[] = [];
  let depth = 0;
  for (let i = 0; i < name.length; i++) {
    if (name[i] === "(") depth++;
    else if (name[i] === ")") depth = Math.max(0, depth - 1);
    else if (name[i] === "-" && depth === 0) hyphens.push(i);
  }
  const spaceBefore = (i: number) => name[i - 1] === " ";
  const spaceAfter = (i: number) => name[i + 1] === " ";
  const separators =
    [
      hyphens.filter((i) => spaceBefore(i) && !spaceAfter(i)),
      hyphens.filter((i) => spaceBefore(i) && spaceAfter(i)),
      hyphens,
    ].find((group) => group.length) ?? [];
  if (!separators.length) return name;

  const parts: string[] = [];
  let start = 0;
  for (const i of separators) {
    parts.push(name.slice(start, i).trim());
    start = i + 1;
  }
  parts.push(name.slice(start).trim());
  return parts.every(Boolean) ? parts.join(" → ") : name;
}
const hex = (c: string) => (c ? `#${c.trim().toUpperCase()}` : undefined);

/** "HH:MM:SS" → segundos (HH puede ser ≥ 24). */
function toSeconds(time: string): number | null {
  const [h, m, s] = time.trim().split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m)
    ? h * 3600 + m * 60 + (s || 0)
    : null;
}

/** Douglas–Peucker iterativo (los trazados largos desbordarían la recursión). */
function simplify(
  points: [number, number][],
  tolerance: number,
): [number, number][] {
  if (points.length <= 2) return points;
  // La longitud se escala por cos(latitud) para medir distancias aproximadamente isótropas.
  const k = Math.cos((points[0][0] * Math.PI) / 180);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ay, ax] = points[a];
    const [by, bx] = points[b];
    const dx = (bx - ax) * k;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxDist = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const px = (points[i][1] - ax) * k;
      const py = points[i][0] - ay;
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const dist = Math.hypot(px - t * dx, py - t * dy);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Escribe `data` como JSON compacto (sin espacios ni saltos de línea), en streaming: los horarios
 * pueden pesar decenas de MB y así cada fichero queda por debajo de los 2 MB que cachea Next.
 */
async function writeJson(
  dir: string,
  name: string,
  data: unknown,
  quiet = false,
) {
  const file = path.join(dir, name);
  const out = createWriteStream(file, "utf8");
  let buf = "";

  async function flush() {
    const chunk = buf;
    buf = "";
    if (chunk && !out.write(chunk)) await once(out, "drain");
  }

  async function emit(value: unknown): Promise<void> {
    if (value === null || typeof value !== "object") {
      buf += JSON.stringify(value);
      return;
    }
    if (Array.isArray(value)) {
      buf += "[";
      for (let i = 0; i < value.length; i++) {
        if (i) buf += ",";
        await emit(value[i]);
        if (buf.length > 1 << 20) await flush();
      }
      buf += "]";
      return;
    }
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    buf += "{";
    for (let i = 0; i < entries.length; i++) {
      if (i) buf += ",";
      buf += `${JSON.stringify(entries[i][0])}:`;
      await emit(entries[i][1]);
      if (buf.length > 1 << 20) await flush();
    }
    buf += "}";
  }

  await emit(data);
  await flush();
  await new Promise<void>((resolve, reject) =>
    out.end((err?: Error | null) => (err ? reject(err) : resolve())),
  );
  const { size } = await stat(file);
  if (!quiet)
    console.log(`    ${name.padEnd(15)} ${(size / 1024).toFixed(0)} KB`);
  return size;
}

// ───────────────────────── Procesado por modo ─────────────────────────

async function processStops(
  rawDir: string,
  outDir: string,
  stopRoutes: Map<string, Set<string>>,
): Promise<number> {
  const stops: Record<
    string,
    {
      name: string;
      lat: number;
      lon: number;
      code?: string;
      parent?: string;
      station?: true;
      routes?: string[];
    }
  > = {};
  for await (const r of readCsv(path.join(rawDir, "stops.txt"))) {
    // location_type: vacío/0 = parada, 1 = estación; 2 (acceso), 3 y 4 no sirven para llegadas.
    if (r.location_type && r.location_type !== "0" && r.location_type !== "1")
      continue;
    const lat = parseFloat(r.stop_lat);
    const lon = parseFloat(r.stop_lon);
    if (!r.stop_id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stops[r.stop_id] = {
      name: clean(r.stop_name),
      lat: round(lat),
      lon: round(lon),
      ...(r.stop_code && { code: r.stop_code }),
      ...(r.parent_station && { parent: r.parent_station }),
      ...(r.location_type === "1" && { station: true }),
      ...(stopRoutes.has(r.stop_id) && {
        routes: [...stopRoutes.get(r.stop_id)!].sort(),
      }),
    };
  }
  await writeJson(outDir, "stops.json", stops);
  return Object.keys(stops).length;
}

async function processRoutes(
  rawDir: string,
  outDir: string,
): Promise<Record<string, string>> {
  const routes: Record<
    string,
    {
      shortName: string;
      longName: string;
      color?: string;
      textColor?: string;
      type: number;
    }
  > = {};
  const longNames: Record<string, string> = {};
  for await (const r of readCsv(path.join(rawDir, "routes.txt"))) {
    routes[r.route_id] = {
      shortName: clean(r.route_short_name),
      longName: withArrows(clean(r.route_long_name)),
      color: hex(r.route_color),
      textColor: hex(r.route_text_color),
      type: Number(r.route_type),
    };
    longNames[r.route_id] = routes[r.route_id].longName;
  }
  await writeJson(outDir, "routes.json", routes);
  return longNames;
}

interface TripInfo {
  routeId: string;
  serviceId: string;
  headsign: string;
}

/** Lee trips.txt y devuelve los viajes y el shape más usado por línea y sentido. */
async function readTrips(rawDir: string, routeNames: Record<string, string>) {
  const trips = new Map<string, TripInfo>();
  // route_id → direction → shape_id → nº de viajes
  const shapeVotes = new Map<string, Map<string, Map<string, number>>>();

  for await (const r of readCsv(path.join(rawDir, "trips.txt"))) {
    // Algunos feeds (Cercanías) no traen trip_headsign: se usa el nombre largo de la línea.
    trips.set(r.trip_id, {
      routeId: r.route_id,
      serviceId: r.service_id,
      headsign: clean(r.trip_headsign) || routeNames[r.route_id] || "",
    });
    if (!r.shape_id) continue;
    const dir = r.direction_id || "0";
    const byDir = shapeVotes.get(r.route_id) ?? new Map();
    const votes = byDir.get(dir) ?? new Map();
    votes.set(r.shape_id, (votes.get(r.shape_id) ?? 0) + 1);
    byDir.set(dir, votes);
    shapeVotes.set(r.route_id, byDir);
  }

  // route_id → direction → shape_id elegido
  const chosen = new Map<string, Record<string, string>>();
  for (const [routeId, byDir] of shapeVotes) {
    const perDir: Record<string, string> = {};
    for (const [dir, votes] of byDir)
      perDir[dir] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    chosen.set(routeId, perDir);
  }
  return { trips, chosen };
}

async function processShapes(
  rawDir: string,
  outDir: string,
  chosen: Map<string, Record<string, string>>,
) {
  const file = path.join(rawDir, "shapes.txt");
  if (!(await exists(file)))
    return console.warn("    · sin shapes.txt, se omite shapes.json");

  const wanted = new Set(
    [...chosen.values()].flatMap((perDir) => Object.values(perDir)),
  );
  const raw = new Map<string, [number, number, number][]>(); // shape_id → [seq, lat, lon]
  for await (const r of readCsv(file)) {
    if (!wanted.has(r.shape_id)) continue;
    const pts = raw.get(r.shape_id) ?? [];
    pts.push([
      Number(r.shape_pt_sequence),
      parseFloat(r.shape_pt_lat),
      parseFloat(r.shape_pt_lon),
    ]);
    raw.set(r.shape_id, pts);
  }

  const simplified = new Map<string, [number, number][]>();
  for (const [shapeId, pts] of raw) {
    pts.sort((a, b) => a[0] - b[0]);
    simplified.set(
      shapeId,
      simplify(
        pts.map(([, lat, lon]) => [lat, lon]),
        SHAPE_TOLERANCE,
      ).map(([lat, lon]) => [round(lat), round(lon)]),
    );
  }

  const shapes: Record<
    string,
    Record<string, { shapeId: string; points: [number, number][] }>
  > = {};
  for (const [routeId, perDir] of chosen) {
    for (const [dir, shapeId] of Object.entries(perDir)) {
      const points = simplified.get(shapeId);
      if (points) (shapes[routeId] ??= {})[dir] = { shapeId, points };
    }
  }
  await writeJson(outDir, "shapes.json", shapes);
}

/**
 * Recorre stop_times.txt una sola vez y devuelve, por parada, las líneas que pasan por ella
 * y (si `withSchedules`) sus horarios `[segundos, route_id, headsign, service_id, trip_id?]`.
 * El headsign va vacío si coincide con el nombre largo de la línea (`routeNames`): se deduce de
 * `routes.json` al leer y así los horarios de las paradas grandes no pasan de 2 MB.
 */
async function readStopTimes(
  rawDir: string,
  trips: Map<string, TripInfo>,
  routeNames: Record<string, string>,
  withSchedules: boolean,
  withTripIds: boolean,
) {
  const stopRoutes = new Map<string, Set<string>>();
  const schedules: Record<string, ScheduleRow[]> = {};
  const file = path.join(rawDir, "stop_times.txt");
  if (!(await exists(file))) return { stopRoutes, schedules };

  for await (const r of readCsv(file)) {
    const trip = trips.get(r.trip_id);
    if (!trip) continue;
    let routes = stopRoutes.get(r.stop_id);
    if (!routes) stopRoutes.set(r.stop_id, (routes = new Set()));
    routes.add(trip.routeId);

    const time = toSeconds(r.departure_time || r.arrival_time);
    if (!withSchedules || time === null) continue;
    const fullHeadsign = clean(r.stop_headsign ?? "") || trip.headsign;
    const headsign =
      fullHeadsign === routeNames[trip.routeId] ? "" : fullHeadsign;
    (schedules[r.stop_id] ??= []).push(
      withTripIds
        ? [time, trip.routeId, headsign, trip.serviceId, r.trip_id]
        : [time, trip.routeId, headsign, trip.serviceId],
    );
  }
  return { stopRoutes, schedules };
}

async function processSchedules(
  rawDir: string,
  outDir: string,
  schedules: Record<string, ScheduleRow[]>,
) {
  // Servicios: calendar.txt + calendar_dates.txt
  const services: Record<
    string,
    {
      days: number[];
      start: string;
      end: string;
      added: string[];
      removed: string[];
    }
  > = {};
  const calendar = path.join(rawDir, "calendar.txt");
  if (await exists(calendar)) {
    const week = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    for await (const r of readCsv(calendar)) {
      services[r.service_id] = {
        days: week.map((d) => Number(r[d])),
        start: r.start_date,
        end: r.end_date,
        added: [],
        removed: [],
      };
    }
  }
  const calendarDates = path.join(rawDir, "calendar_dates.txt");
  if (await exists(calendarDates)) {
    for await (const r of readCsv(calendarDates)) {
      const s = (services[r.service_id] ??= {
        days: [0, 0, 0, 0, 0, 0, 0],
        start: "",
        end: "",
        added: [],
        removed: [],
      });
      (r.exception_type === "1" ? s.added : s.removed).push(r.date);
    }
  }
  await writeJson(outDir, "services.json", services);

  // Un fichero por parada: el servidor solo lee el de la parada consultada.
  const schedulesDir = path.join(outDir, "schedules");
  await mkdir(schedulesDir, { recursive: true });
  const stopIds = Object.keys(schedules);
  let bytes = 0;
  for (let i = 0; i < stopIds.length; i += 200) {
    const sizes = await Promise.all(
      stopIds.slice(i, i + 200).map((stopId) => {
        schedules[stopId].sort((a, b) => a[0] - b[0]);
        // encodeURIComponent evita caracteres problemáticos en el nombre del fichero.
        return writeJson(
          schedulesDir,
          `${encodeURIComponent(stopId)}.json`,
          schedules[stopId],
          true,
        );
      }),
    );
    bytes += sizes.reduce((a, b) => a + b, 0);
  }
  console.log(
    `    schedules/      ${stopIds.length} ficheros, ${(bytes / 1024).toFixed(0)} KB`,
  );
}

async function processMode(mode: string, withSchedules: boolean) {
  const rawDir = path.join(RAW_DIR, mode);
  const outDir = path.join(OUT_DIR, mode);
  for (const required of ["stops.txt", "routes.txt", "trips.txt"]) {
    if (!(await exists(path.join(rawDir, required))))
      throw new Error(`falta ${required}`);
  }

  console.log(`· ${mode}`);
  // Se reemplaza la salida anterior para no dejar ficheros obsoletos.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const routeNames = await processRoutes(rawDir, outDir);
  const { trips, chosen } = await readTrips(rawDir, routeNames);
  const withTripIds = TRIP_ID_MODES.has(mode);
  const { stopRoutes, schedules } = await readStopTimes(
    rawDir,
    trips,
    routeNames,
    withSchedules,
    withTripIds,
  );
  if (withTripIds) {
    // Línea (y destino, si no es el nombre largo de la línea) de cada viaje: el tiempo real solo
    // trae el trip_id. Se omite el destino cuando sobra para no pasar de 2 MB (caché de Next).
    const tripIndex: Record<string, string | [string, string]> = {};
    for (const [tripId, trip] of trips)
      tripIndex[tripId] =
        trip.headsign === routeNames[trip.routeId]
          ? trip.routeId
          : [trip.routeId, trip.headsign];
    await writeJson(outDir, "trips.json", tripIndex);
  }
  await processStops(rawDir, outDir, stopRoutes);
  await processShapes(rawDir, outDir, chosen);
  if (withSchedules) await processSchedules(rawDir, outDir, schedules);
}

// ───────────────────────── Main ─────────────────────────

const args = process.argv.slice(2);
const withSchedules = !args.includes("--no-schedules");
const requested = args.filter((a) => !a.startsWith("--"));

const available = (await readdir(RAW_DIR, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const modes = requested.length ? requested : available;

if (!modes.length) {
  console.error(
    "No hay datos en data/gtfs/raw/. Ejecuta antes: npm run gtfs:download",
  );
  process.exit(1);
}

let failed = 0;
for (const mode of modes) {
  if (!available.includes(mode)) {
    console.error(`✗ ${mode}: no existe data/gtfs/raw/${mode}/`);
    failed++;
    continue;
  }
  try {
    await processMode(mode, withSchedules);
  } catch (err) {
    console.error(`✗ ${mode}: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
