/**
 * Copia el worker de MapLibre GL a `public/maplibre/` para servirlo como fichero estático.
 * MapLibre deduce la ruta del worker de la URL de su propio módulo, que con el bundler de Next
 * no apunta a `node_modules`; `TransitMapCanvas` la fija con `setWorkerUrl`.
 * Se ejecuta en `postinstall` (y a mano con `node scripts/copy-maplibre-worker.mjs`). Es `.mjs`
 * y no `.mts` porque corre en cualquier instalación, también en la plataforma de despliegue.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const targetDir = path.join(root, "public/maplibre");

if (!existsSync(source)) {
  console.warn("maplibre-gl no está instalado: no se copia el worker");
} else {
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, path.join(targetDir, "maplibre-gl-worker.mjs"));
  console.log("Worker de MapLibre copiado a public/maplibre/");
}
