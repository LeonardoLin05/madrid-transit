/**
 * Sube `data/gtfs/processed/` a Vercel Blob, conservando la estructura (`<modo>/stops.json`,
 * `<modo>/schedules/<stop_id>.json`…), y borra del almacén los ficheros que ya no existan.
 * Uso:
 *   npm run gtfs:upload                 # todos los modos
 *   npm run gtfs:upload -- metro emt    # solo esos modos
 *
 * Requiere BLOB_READ_WRITE_TOKEN (Vercel → Storage → Blob). Opcional: GTFS_CACHE_SECONDS
 * (caché del CDN, 86400 por defecto). Al terminar imprime el valor para GTFS_DATA_URL.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { del, list, put } from "@vercel/blob";

const PROCESSED_DIR = path.resolve(
  import.meta.dirname,
  "../data/gtfs/processed",
);
const CACHE_SECONDS = Number(process.env.GTFS_CACHE_SECONDS ?? 86400);
const CONCURRENCY = 16;

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Falta BLOB_READ_WRITE_TOKEN (ver .env.example).");
  process.exit(1);
}

/** Lista recursivamente los ficheros de `dir` como rutas relativas con "/". */
async function walk(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(dir, rel), {
    withFileTypes: true,
  })) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(dir, next)));
    else if (entry.name.endsWith(".json")) out.push(next);
  }
  return out;
}

/** Ejecuta `task` sobre `items` con un máximo de `limit` en paralelo. */
async function pool<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await task(items[next++]);
    }),
  );
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const available = (
  await readdir(PROCESSED_DIR, { withFileTypes: true }).catch(() => [])
)
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const modes = args.length ? args : available;

if (!modes.length) {
  console.error(
    "No hay datos en data/gtfs/processed/. Ejecuta antes: npm run gtfs:process",
  );
  process.exit(1);
}

let failed = 0;
let sampleUrl = "";

for (const mode of modes) {
  if (!available.includes(mode)) {
    console.error(`✗ ${mode}: no existe data/gtfs/processed/${mode}/`);
    failed++;
    continue;
  }
  const modeDir = path.join(PROCESSED_DIR, mode);
  const files = await walk(modeDir);
  const uploaded = new Set<string>();
  let errors = 0;
  let done = 0;
  console.log(`· ${mode}: subiendo ${files.length} ficheros…`);

  await pool(files, CONCURRENCY, async (file) => {
    const pathname = `${mode}/${file}`;
    try {
      const blob = await put(
        pathname,
        await readFile(path.join(modeDir, file)),
        {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
          cacheControlMaxAge: CACHE_SECONDS,
        },
      );
      uploaded.add(pathname);
      sampleUrl ||= blob.url.slice(0, blob.url.length - pathname.length);
    } catch (err) {
      errors++;
      console.error(
        `  ✗ ${pathname}: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (++done % 1000 === 0) console.log(`  ${done}/${files.length}`);
  });

  if (errors) {
    // Sin borrar nada: mejor datos antiguos que un almacén incompleto.
    console.error(
      `✗ ${mode}: ${errors} errores; no se limpian ficheros antiguos`,
    );
    failed++;
    continue;
  }

  // Limpieza de ficheros que ya no se generan (paradas eliminadas, etc.).
  const stale: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: `${mode}/`, cursor });
    for (const blob of page.blobs)
      if (!uploaded.has(blob.pathname)) stale.push(blob.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < stale.length; i += 100)
    await del(stale.slice(i, i + 100));
  console.log(
    `✓ ${mode}: ${uploaded.size} subidos, ${stale.length} obsoletos borrados`,
  );
}

if (sampleUrl) console.log(`\nGTFS_DATA_URL=${sampleUrl.replace(/\/+$/, "")}`);
process.exit(failed ? 1 : 0);
