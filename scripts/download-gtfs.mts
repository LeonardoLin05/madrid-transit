/**
 * Descarga los GTFS estáticos del CRTM, los descomprime en `data/gtfs/raw/<modo>/`
 * (sin carpeta intermedia) y conserva solo los ficheros de `KEEP_FILES`. El ZIP no se guarda.
 * Uso: npm run gtfs:download   (Node >= 22.18 ejecuta TypeScript directamente)
 *
 * Las URLs se leen de variables de entorno GTFS_URL_<MODO> (ver .env.example),
 * obtenidas del portal de datos abiertos del CRTM.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

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

const OUT_DIR = path.resolve(import.meta.dirname, "../data/gtfs/raw");

await mkdir(OUT_DIR, { recursive: true });

for (const mode of MODES) {
  const envKey = `GTFS_URL_${mode.replace("-", "_").toUpperCase()}`;
  const url = process.env[envKey];
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
  } catch (err) {
    console.error(
      `✗ ${mode}: no se pudo descomprimir (${err instanceof Error ? err.message : err})`,
    );
  }
}
