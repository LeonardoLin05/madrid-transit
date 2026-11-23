"use client";

import { Info, RefreshCwOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { DeparturesTable } from "@/components/transport/DeparturesTable";
import { LineBadge } from "@/components/transport/LineBadge";
import { LineFilter, useLineFilter } from "@/components/transport/LineFilter";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { useNow } from "@/hooks/useNow";
import { useRealtime } from "@/hooks/useRealtime";
import { destinationOf, formatTime } from "@/lib/format";
import type { Arrival, ScheduledDeparture, StopLine } from "@/types/transport";

/** Llegadas que se muestran con todas las líneas seleccionadas (sin filtro). */
const UNFILTERED_LIMIT = 25;
const POLL_MS = 20_000;

/**
 * Próximos trenes de una parada de Cercanías en tiempo real (retraso, supresiones, vía y dónde
 * va el tren), con filtro por línea. Mientras carga el tiempo real, o si falla sin datos previos,
 * muestra el horario teórico calculado en el servidor (`scheduled`), si se pasa.
 * Se usa en la pantalla de la parada y en el panel de la parada del mapa; en este último no lleva
 * botón de refrescar (`showRefresh`) porque el del mapa lo hace a través de `refreshKey`.
 */
export function CercaniasDepartures({
  stopId,
  lines,
  scheduled,
  showRefresh = true,
  refreshKey = 0,
}: {
  stopId: string;
  lines: StopLine[];
  scheduled?: ScheduledDeparture[];
  showRefresh?: boolean;
  /** Al cambiar, se vuelve a consultar (refresco pedido desde fuera). */
  refreshKey?: number;
}) {
  const { data, error, refreshing, refresh } = useRealtime(
    "cercanias",
    stopId,
    POLL_MS,
  );
  // Solo cuando cambia tras montarse (al montarse ya consulta `useRealtime`).
  const lastRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === lastRefreshKey.current) return;
    lastRefreshKey.current = refreshKey;
    refresh();
  }, [refreshKey, refresh]);
  const filter = useLineFilter(lines);
  const now = useNow();
  const lineByName = new Map(lines.map((l) => [l.shortName, l]));

  const emptyMessage = filter.selected
    ? "No hay trenes próximos de las líneas seleccionadas."
    : "No hay trenes próximos en esta parada.";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <LineFilter lines={lines} filter={filter} />
      <div className="flex items-center justify-between gap-2">
        <LiveStatus
          updatedAt={data?.updatedAt}
          error={error}
          hasData={data !== null}
          hasFallback={scheduled !== undefined}
        />
        {/* Márgenes negativos: objetivo de 44 px sin agrandar la fila. */}
        {showRefresh && (
          <RefreshButton
            onClick={refresh}
            refreshing={refreshing}
            label="Actualizar trenes"
            className="-my-3 -mr-2.5"
          />
        )}
      </div>
      {data ? (
        <ArrivalList
          arrivals={data.arrivals
            .filter((a) => filter.matches(a.routeShortName))
            .slice(0, filter.selected ? undefined : UNFILTERED_LIMIT)}
          lineByName={lineByName}
          now={now}
          emptyMessage={emptyMessage}
        />
      ) : scheduled ? (
        <DeparturesTable
          departures={
            filter.selected
              ? scheduled.filter((d) => filter.matches(d.routeShortName))
              : scheduled.slice(0, UNFILTERED_LIMIT)
          }
          emptyMessage={emptyMessage}
        />
      ) : (
        !error && (
          <p className="text-sm text-muted" aria-live="polite">
            Cargando trenes…
          </p>
        )
      )}
    </div>
  );
}

function LiveStatus({
  updatedAt,
  error,
  hasData,
  hasFallback,
}: {
  updatedAt?: string;
  error: string | null;
  hasData: boolean;
  /** Si hay horario teórico de respaldo mientras no hay tiempo real. */
  hasFallback: boolean;
}) {
  const base = "flex items-center gap-1.5 text-xs";
  if (error && !hasData) {
    return (
      <p className={`${base} text-muted`}>
        <Info size={14} className="shrink-0" aria-hidden />
        {hasFallback
          ? "Tiempo real no disponible: horario teórico, sin retrasos ni incidencias."
          : "Tiempo real no disponible ahora mismo."}
      </p>
    );
  }
  if (!hasData) {
    return (
      <p className={`${base} text-muted`} aria-live="polite">
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-faint" />
        Conectando con el tiempo real…
        {hasFallback && " (mientras, horario teórico)"}
      </p>
    );
  }
  if (error) {
    return (
      <p className={`${base} text-warn-fg`}>
        <RefreshCwOff size={14} className="shrink-0" aria-hidden />
        No se pudo actualizar; datos de las {formatTime(updatedAt!)}.
      </p>
    );
  }
  return (
    <p className={`${base} text-muted`}>
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-(--mode-color) opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-(--mode-color)" />
      </span>
      En directo · actualizado a las {formatTime(updatedAt!)}
    </p>
  );
}

function ArrivalList({
  arrivals,
  lineByName,
  now,
  emptyMessage,
}: {
  arrivals: Arrival<"cercanias">[];
  lineByName: Map<string, StopLine>;
  now: number;
  emptyMessage: string;
}) {
  if (!arrivals.length) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }
  return (
    <ul
      tabIndex={0}
      aria-label="Próximos trenes"
      className="flex-1 min-h-0 divide-y divide-line overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface scrollbar-thin"
    >
      {arrivals.map((a) => (
        <ArrivalRow
          key={`${a.tripId}|${a.scheduledAt}`}
          arrival={a}
          line={lineByName.get(a.routeShortName)}
          now={now}
        />
      ))}
    </ul>
  );
}

function ArrivalRow({
  arrival: a,
  line,
  now,
}: {
  arrival: Arrival<"cercanias">;
  line?: StopLine;
  now: number;
}) {
  const minutes = Math.round((Date.parse(a.expectedAt) - now) / 60_000);
  const delayMin = Math.round((a.delaySeconds ?? 0) / 60);
  const expected = formatTime(a.expectedAt);
  const scheduled = a.scheduledAt ? formatTime(a.scheduledAt) : expected;

  const details: React.ReactNode[] = [];
  if (a.canceled) {
    details.push(
      <span key="c" className="font-medium text-danger">
        Suprimido
      </span>,
    );
  } else if (a.realtime) {
    if (a.status === "stopped") details.push("En el andén");
    else if (a.status === "arriving") details.push("Llegando");
    else if (a.trainStopName) details.push(`Va por ${a.trainStopName}`);
    if (a.platform) details.push(`Vía ${a.platform}`);
    if (delayMin > 0)
      details.push(
        <span key="d" className="font-medium text-warn-fg">
          +{delayMin} min
        </span>,
      );
    else if (delayMin < 0)
      details.push(
        <span key="e" className="font-medium text-ok-fg">
          Adelantado {-delayMin} min
        </span>,
      );
    else if (a.delaySeconds !== undefined) details.push("Puntual");
  } else {
    details.push(
      <span key="t" className="text-faint">
        Horario teórico
      </span>,
    );
  }

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${a.canceled ? "opacity-60" : ""}`}
    >
      <LineBadge
        shortName={a.routeShortName}
        color={line?.color}
        textColor={line?.textColor}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[15px] ${a.canceled ? "line-through" : ""}`}
          title={a.headsign}
        >
          {destinationOf(a.headsign)}
        </span>
        <span className="block truncate text-xs text-muted">
          {details.map((d, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {d}
            </span>
          ))}
        </span>
      </span>
      <span className="text-right tabular-nums">
        <span
          className={`text-sm font-medium ${a.canceled ? "line-through" : ""}`}
        >
          {a.canceled
            ? scheduled
            : minutes < 1
              ? "Ahora"
              : minutes < 60
                ? `${minutes} min`
                : expected}
        </span>
        <span className="block text-xs text-muted">
          {!a.canceled && delayMin !== 0 ? (
            <>
              <s className="text-faint">{scheduled}</s>{" "}
              <span className={delayMin > 0 ? "text-warn-fg" : "text-ok-fg"}>
                {expected}
              </span>
            </>
          ) : (
            scheduled
          )}
        </span>
      </span>
    </li>
  );
}
