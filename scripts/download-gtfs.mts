/**
 * Descarga los GTFS estáticos, los descomprime en `data/gtfs/raw/<modo>/` (sin carpeta
 * intermedia) y conserva solo los ficheros de `KEEP_FILES`. El ZIP no se guarda.
 * Uso: npm run gtfs:download   (Node >= 22.18 ejecuta TypeScript directamente)
 *
 * Las URLs se leen de variables de entorno GTFS_URL_<MODO> (ver .env.example). Salvo Cercanías,
 * son del portal de datos abiertos del CRTM. Cercanías sale del GTFS de Renfe, que es público
 * (`DEFAULT_URLS`) y cubre todos los núcleos de España: se recorta a Madrid con `FILTERS`.
 */
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { joinCsvLine, readCsv, type Row } from "./lib/csv.mts";

const MODES = ["metro", "metro-ligero", "cercanias", "emt", "interurbanos"];

/**
 * Ficheros GTFS que usa la app; el resto (agency, feed_info...) se descarta.
 * Si hace falta otro, añadirlo aquí y volver a ejecutar la descarga.
 */
const KEEP_FILES = new Set([
  "stops.txt", // nombres y coordenadas de paradas
  "routes.txt", // nombre corto y color de las líneas
  "trips.txt", // destino (headsign) y línea de cada viaje
  "stop_times.txt", // horario teórico por parada
  "calendar.txt", // días de servicio
  "calendar_dates.txt", // excepciones del calendario
  "shapes.txt", // trazado de las rutas para dibujarlas en el mapa
]);

/** URL por defecto de los modos cuyo GTFS es público; la variable GTFS_URL_<MODO> la sustituye. */
const DEFAULT_URLS: Record<string, string> = {
  cercanias:
    "https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip",
};

/**
 * Modos cuyo feed trae más de lo que usa la app: solo se conservan las líneas que cumplen el filtro
 * y, a partir de ellas, sus viajes, horarios, paradas, servicios y trazados.
 * Renfe Cercanías: el `route_id` empieza por el código del núcleo, y el de Madrid es "10"
 * (`10T0001C1`). Sus `trip_id`, `stop_id` y `route_id` son los de los feeds GTFS-RT de Renfe.
 */
const FILTERS: Record<string, (route: Row) => boolean> = {
  cercanias: (route) => route.route_id.startsWith("10T"),
};

const OUT_DIR = path.resolve(import.meta.dirname, "../data/gtfs/raw");

/**
 * Reescribe `file` dejando solo las filas que cumplen `keep` (y los valores sin espacios de relleno).
 * En streaming, porque `stop_times.txt` puede pesar cientos de MB. Devuelve las filas conservadas.
 */
async function filterCsv(
  file: string,
  keep: (row: Row) => boolean,
): Promise<number> {
  const tmp = `${file}.tmp`;
  const out = createWriteStream(tmp, "utf8");
  let header: string[] | null = null;
  let kept = 0;
  for await (const row of readCsv(file)) {
    if (!header) {
      header = Object.keys(row);
      out.write(`${joinCsvLine(header)}\n`);
    }
    if (!keep(row)) continue;
    if (!out.write(`${joinCsvLine(header.map((h) => row[h]))}\n`))
      await new Promise<void>((resolve) => out.once("drain", () => resolve()));
    kept++;
  }
  await new Promise<void>((resolve, reject) =>
    out.end((err?: Error | null) => (err ? reject(err) : resolve())),
  );
  await rename(tmp, file);
  return kept;
}

/** Recorta el GTFS de `dir` a las líneas que cumplen `keepRoute`, en orden de dependencias. */
async function filterFeed(dir: string, keepRoute: (route: Row) => boolean) {
  const csv = (file: string) => path.join(dir, file);
  const has = (file: string) => existsSync(csv(file));

  const routes = new Set<string>();
  await filterCsv(csv("routes.txt"), (r) => {
    if (!keepRoute(r)) return false;
    routes.add(r.route_id);
    return true;
  });

  const trips = new Set<string>();
  const services = new Set<string>();
  const shapes = new Set<string>();
  await filterCsv(csv("trips.txt"), (r) => {
    if (!routes.has(r.route_id)) return false;
    trips.add(r.trip_id);
    services.add(r.service_id);
    if (r.shape_id) shapes.add(r.shape_id);
    return true;
  });

  const stops = new Set<string>();
  if (has("stop_times.txt"))
    await filterCsv(csv("stop_times.txt"), (r) => {
      if (!trips.has(r.trip_id)) return false;
      stops.add(r.stop_id);
      return true;
    });

  // Las estaciones (parent_station) de las paradas usadas también se conservan.
  const parents = new Set<string>();
  for await (const r of readCsv(csv("stops.txt")))
    if (stops.has(r.stop_id) && r.parent_station) parents.add(r.parent_station);
  await filterCsv(
    csv("stops.txt"),
    (r) => stops.has(r.stop_id) || parents.has(r.stop_id),
  );

  for (const file of ["calendar.txt", "calendar_dates.txt"])
    if (has(file))
      await filterCsv(csv(file), (r) => services.has(r.service_id));
  if (has("shapes.txt"))
    await filterCsv(csv("shapes.txt"), (r) => shapes.has(r.shape_id));

  return { routes: routes.size, trips: trips.size, stops: stops.size };
}

await mkdir(OUT_DIR, { recursive: true });

for (const mode of MODES) {
  const envKey = `GTFS_URL_${mode.replace("-", "_").toUpperCase()}`;
  const url = process.env[envKey] || DEFAULT_URLS[mode];
  if (!url) {
    console.warn(`· ${mode}: sin URL (${envKey}), se omite`);
    continue;
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${mode}: HTTP ${res.status}`);
    continue;
  }
  const modeDir = path.join(OUT_DIR, mode);
  try {
    const entries = Object.entries(
      unzipSync(new Uint8Array(await res.arrayBuffer())),
    ).filter(([name]) => !name.endsWith("/") && !name.startsWith("__MACOSX/"));
    // Si todo el contenido está dentro de una única carpeta, se "sube" un nivel.
    const roots = new Set(
      entries.map(([name]) => (name.includes("/") ? name.split("/")[0] : "")),
    );
    const wrapper =
      roots.size === 1 && !roots.has("") ? `${[...roots][0]}/` : "";

    // Se reemplaza el contenido anterior para no dejar ficheros obsoletos.
    await rm(modeDir, { recursive: true, force: true });
    await mkdir(modeDir, { recursive: true });

    const kept = new Set<string>();
    for (const [name, data] of entries) {
      const file = name.slice(wrapper.length);
      // Solo ficheros de la raíz con nombre permitido: también evita rutas fuera de la carpeta (zip slip).
      if (!KEEP_FILES.has(file)) continue;
      await writeFile(path.join(modeDir, file), data);
      kept.add(file);
    }
    const missing = [...KEEP_FILES].filter((file) => !kept.has(file));
    console.log(
      `✓ ${mode} → ${path.relative(process.cwd(), modeDir)}/ (${kept.size}/${KEEP_FILES.size} ficheros` +
        `${missing.length ? `; faltan: ${missing.join(", ")}` : ""})`,
    );
    if (FILTERS[mode]) {
      const n = await filterFeed(modeDir, FILTERS[mode]);
      console.log(
        `  filtrado: ${n.routes} líneas, ${n.trips} viajes, ${n.stops} paradas`,
      );
    }
  } catch (err) {
    // Sin datos antes que con datos a medias (p. ej. un feed de toda España sin filtrar).
    await rm(modeDir, { recursive: true, force: true });
    console.error(
      `✗ ${mode}: no se pudo descomprimir o filtrar (${err instanceof Error ? err.message : err})`,
    );
  }
}
