"use client";

import { RefreshCwOff } from "lucide-react";
import { LineFilter, useLineFilter } from "@/components/transport/LineFilter";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { formatTime } from "@/lib/format";
import { useAlerts } from "@/hooks/useRealtime";
import type { AlertsResponse, StopLine } from "@/types/transport";
import { AlertCard } from "./AlertCard";

/**
 * Avisos de Cercanías con filtro por línea. Parte de los que trae el servidor (`initial`) y se
 * refresca cada minuto.
 */
export function AlertsList({
  initial,
}: {
  initial: AlertsResponse<"cercanias"> | null;
}) {
  const { data: live, error, refreshing, refresh } = useAlerts("cercanias");
  const data = live ?? initial;
  const alerts = data?.alerts ?? [];

  const lineMap = new Map<string, StopLine>();
  for (const alert of alerts)
    for (const line of alert.lines) lineMap.set(line.shortName, line);
  const lines = [...lineMap.values()].sort((a, b) =>
    a.shortName.localeCompare(b.shortName, "es", { numeric: true }),
  );
  const filter = useLineFilter(lines);
  const shown = alerts.filter(
    (a) =>
      filter.selected === null ||
      a.lines.some((l) => filter.matches(l.shortName)),
  );

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <RefreshCwOff size={16} className="shrink-0" aria-hidden />
        <p className="flex-1">
          {refreshing
            ? "Consultando los avisos de Renfe…"
            : "No se pudieron consultar los avisos de Renfe."}
        </p>
        <RefreshButton
          onClick={refresh}
          refreshing={refreshing}
          label="Reintentar"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <LineFilter lines={lines} filter={filter} />
      <div className="flex items-center justify-between gap-2">
        {error ? (
          <p className="flex items-center gap-1.5 text-xs text-warn-fg">
            <RefreshCwOff size={14} className="shrink-0" aria-hidden />
            No se pudieron actualizar; datos de las {formatTime(data.updatedAt)}
            .
          </p>
        ) : (
          <p className="text-xs text-muted">
            Actualizado a las {formatTime(data.updatedAt)}
          </p>
        )}
        {/* Márgenes negativos: objetivo de 44 px sin agrandar la fila. */}
        <RefreshButton
          onClick={refresh}
          refreshing={refreshing}
          label="Actualizar avisos"
          className="-my-3 -mr-2.5"
        />
      </div>
      {shown.length ? (
        <ul
          tabIndex={0}
          aria-label="Avisos"
          className="flex-1 min-h-0 divide-y divide-line overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface scrollbar-thin"
        >
          {shown.map((alert) => (
            <li key={alert.id} className="px-4 py-3">
              <AlertCard alert={alert} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          {filter.selected
            ? "No hay avisos de las líneas seleccionadas."
            : "No hay avisos en Cercanías Madrid ahora mismo."}
        </p>
      )}
    </div>
  );
}
