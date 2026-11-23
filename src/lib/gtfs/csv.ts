/**
 * Parser CSV mínimo para ficheros GTFS (RFC 4180: comillas, comillas escapadas, CRLF, BOM).
 * Pensado para usarse en scripts de preprocesado y en código de servidor, nunca en cliente.
 */
export function parseCsv<T extends object = Record<string, string>>(
  text: string,
): T[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...data] = rows.filter((r) => r.length > 1 || r[0] !== "");
  if (!header) return [];
  return data.map(
    (values) =>
      Object.fromEntries(
        header.map((key, idx) => [key.trim(), values[idx] ?? ""]),
      ) as T,
  );
}
