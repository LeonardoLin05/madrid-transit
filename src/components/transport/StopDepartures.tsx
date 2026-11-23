"use client";

import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RefreshButton } from "@/components/ui/RefreshButton";
import type { ScheduledDeparture, StopLine } from "@/types/transport";
import { DeparturesTable } from "./DeparturesTable";
import { LineFilter, useLineFilter } from "./LineFilter";

/** Salidas que se muestran con todas las líneas seleccionadas (sin filtro). */
const UNFILTERED_LIMIT = 20;

/**
 * Líneas de una parada (insignias seleccionables, ver `LineFilter`) y sus próximas salidas
 * teóricas. `departures` debe traer salidas de cada línea (ver `perLine` en `getNextDepartures`).
 * El botón de actualizar vuelve a pedir la página al servidor (`router.refresh()`), que recalcula
 * las salidas con la hora actual sin perder el filtro.
 */
export function StopDepartures({
  lines,
  departures,
}: {
  lines: StopLine[];
  departures: ScheduledDeparture[];
}) {
  const filter = useLineFilter(lines);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const shown = filter.selected
    ? departures.filter((d) => filter.matches(d.routeShortName))
    : departures.slice(0, UNFILTERED_LIMIT);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <LineFilter lines={lines} filter={filter} />
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Info size={14} className="shrink-0" aria-hidden />
          Horario teórico; no incluye retrasos ni incidencias.
        </p>
        {/* Márgenes negativos: objetivo de 44 px sin agrandar la fila. */}
        <RefreshButton
          onClick={() => startRefresh(() => router.refresh())}
          refreshing={refreshing}
          label="Actualizar salidas"
          className="-my-3 -mr-2.5"
        />
      </div>
      <DeparturesTable
        departures={shown}
        emptyMessage={
          filter.selected
            ? "No hay salidas próximas de las líneas seleccionadas."
            : undefined
        }
      />
    </div>
  );
}
