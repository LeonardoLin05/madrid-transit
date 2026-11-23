"use client";

import { MapPin, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { StopSearchResult } from "@/lib/gtfs/search";
import type { TransportModeId } from "@/types/transport";
import { LineBadge } from "./LineBadge";

/** Máximo de líneas por resultado (el resto, como «+N»). */
const MAX_RESULT_LINES = 10;
const DEBOUNCE_MS = 150;

/**
 * Buscador de paradas en vivo: mientras se escribe consulta `/api/stops/<modo>` y muestra una
 * vista previa de cada parada (nombre, código y líneas). Al elegir una, o con Enter (primera
 * coincidencia), se abre la pantalla de la parada: `<href>/<stopId>?q=<consulta>`.
 * `initialQuery` rellena el cuadro y lanza esa búsqueda al cargar.
 */
export function StopSearch({
  modeId,
  href,
  initialQuery,
}: {
  modeId: TransportModeId;
  href: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  // Último resultado recibido y para qué texto era; mientras `query` no lo alcanza, se está cargando.
  const [data, setData] = useState<{
    q: string;
    results: StopSearchResult[];
    error: boolean;
  } | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/stops/${modeId}?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { results: StopSearchResult[] };
        setData({ q: trimmed, results: body.results, error: false });
      } catch (err) {
        if ((err as Error).name !== "AbortError")
          setData({ q: trimmed, results: [], error: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, modeId]);

  const results = data?.results ?? [];
  const loading = trimmed !== "" && data?.q !== trimmed;

  const stopHref = (id: string) =>
    `${href}/${encodeURIComponent(id)}?${new URLSearchParams({ q: trimmed })}`;
  const showList = trimmed !== "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative shrink-0">
        <Search
          size={18}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-faint"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) {
              router.push(stopHref(results[0].id));
            }
          }}
          placeholder="Buscar parada por nombre o código…"
          aria-label="Buscar parada"
          autoComplete="off"
          className="w-full rounded-xl border border-line bg-surface py-3 pr-4 pl-11 text-base placeholder:text-faint"
        />
      </div>

      {!showList && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
          <MapPin size={28} className="text-faint" aria-hidden />
          <p>Busca una parada para ver sus próximas salidas.</p>
        </div>
      )}
      {showList && !loading && data?.error && (
        <p className="shrink-0 text-sm text-danger">
          No se pudo buscar paradas. Inténtalo de nuevo.
        </p>
      )}
      {showList && !loading && !data?.error && results.length === 0 && (
        <p className="shrink-0 text-sm text-muted">
          Sin resultados para «{trimmed}».
        </p>
      )}
      {showList && results.length > 0 && (
        <ul
          className={`min-h-0 divide-y divide-line overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface transition-opacity scrollbar-thin ${
            loading ? "opacity-60" : ""
          }`}
        >
          {results.map((r) => (
            <li key={r.id}>
              <Link
                href={stopHref(r.id)}
                className="flex flex-col gap-2 px-4 py-3.5 hover:bg-hover active:bg-hover"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-medium">{r.name}</span>
                  {r.code && (
                    <span className="text-xs text-muted tabular-nums">
                      {r.code}
                    </span>
                  )}
                </span>
                {r.lines.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1">
                    {r.lines.slice(0, MAX_RESULT_LINES).map((line) => (
                      <LineBadge key={line.shortName} {...line} />
                    ))}
                    {r.lines.length > MAX_RESULT_LINES && (
                      <span className="text-xs text-muted">
                        +{r.lines.length - MAX_RESULT_LINES}
                      </span>
                    )}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
