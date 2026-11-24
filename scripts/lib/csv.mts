/** Lectura y escritura de los CSV de un GTFS, compartida por los scripts de `scripts/`. */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export type Row = Record<string, string>;

/** Separa una línea CSV respetando comillas ("a,b", "" escapadas). */
export function splitCsvLine(line: string): string[] {
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

/** Une celdas en una línea CSV, entrecomillando las que lo necesitan. */
export function joinCsvLine(cells: string[]): string {
  return cells
    .map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
    .join(",");
}

/**
 * Itera las filas de un CSV como objetos cabecera → valor (admite BOM y CRLF). Los valores se
 * recortan: algunos feeds (Renfe) rellenan cada campo con espacios hasta un ancho fijo.
 */
export async function* readCsv(file: string): AsyncGenerator<Row> {
  const lines = createInterface({
    input: createReadStream(file, "utf8"),
    crlfDelay: Infinity,
  });
  let header: string[] | null = null;
  for await (const raw of lines) {
    const line = header ? raw : raw.replace(/^﻿/, "");
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    if (!header) {
      header = cells.map((h) => h.trim());
      continue;
    }
    const row: Row = {};
    for (let i = 0; i < header.length; i++)
      row[header[i]] = (cells[i] ?? "").trim();
    yield row;
  }
}
