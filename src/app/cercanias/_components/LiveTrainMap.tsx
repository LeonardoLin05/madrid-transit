"use client";

import { useCallback, useState } from "react";
import { TransitMap } from "@/components/transport/TransitMap";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { useAlerts, useVehicles } from "@/hooks/useRealtime";
import { formatTime } from "@/lib/format";
import type { MapLine, MapStop } from "@/lib/gtfs/map";
import { StopSheet } from "./StopSheet";

/**
 * Mapa de Cercanías con la posición de los trenes en directo (se refresca cada 15 s). Al pulsar
 * una parada se abre su panel (`StopSheet`) con los próximos trenes; el botón de refrescar del
 * mapa actualiza a la vez trenes, avisos y el panel.
 */
export function LiveTrainMap({
  lines,
  stops,
}: {
  lines: MapLine[];
  stops: MapStop[];
}) {
  const { data, error, refreshing, refresh } = useVehicles("cercanias");
  const alerts = useAlerts("cercanias");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Cada pulsación del botón de refrescar la incrementa; el panel de la parada la escucha.
  const [refreshKey, setRefreshKey] = useState(0);
  const selected = selectedId
    ? stops.find((s) => s.id === selectedId)
    : undefined;
  const close = useCallback(() => setSelectedId(null), []);

  const refreshAll = () => {
    refresh();
    alerts.refresh();
    setRefreshKey((k) => k + 1);
  };

  const label = data
    ? `${data.vehicles.length} trenes en directo · ${formatTime(data.updatedAt)}`
    : error
      ? "Posición de los trenes no disponible"
      : "Localizando trenes…";

  return (
    <TransitMap
      lines={lines}
      stops={stops}
      stopBasePath="/cercanias"
      vehicles={data?.vehicles}
      onStopClick={setSelectedId}
      selectedStopId={selectedId}
      panel={
        selected && (
          <StopSheet
            stop={selected}
            alerts={alerts.data?.alerts ?? []}
            refreshKey={refreshKey}
            onClose={close}
          />
        )
      }
      overlay={
        <div className="flex items-center gap-1">
          <p
            aria-live="polite"
            className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3 text-xs text-muted backdrop-blur"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${
                data && !error
                  ? "bg-(--mode-color)"
                  : error
                    ? "bg-warn-fg"
                    : "animate-pulse bg-faint"
              }`}
            />
            {label}
          </p>
          <RefreshButton
            onClick={refreshAll}
            refreshing={refreshing}
            label="Actualizar trenes"
            className="pointer-events-auto rounded-full border border-line bg-surface/90 backdrop-blur"
          />
        </div>
      }
    />
  );
}
