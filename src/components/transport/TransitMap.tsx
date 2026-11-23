"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import type { MapLine, MapStop } from "@/lib/gtfs/map";
import type { VehiclePosition } from "@/types/transport";

// MapLibre necesita `window`/WebGL: se carga solo en el navegador.
const Canvas = dynamic(() => import("./TransitMapCanvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-hover" />,
});

/**
 * Mapa de líneas y paradas de un modo (los datos salen de `getMapData`). Opcionalmente, vehículos
 * en tiempo real (`vehicles`), un elemento superpuesto arriba a la izquierda (`overlay`) y un panel
 * abajo (`panel`, p. ej. la parada pulsada con `onStopClick`).
 */
export function TransitMap({
  overlay,
  panel,
  ...props
}: {
  lines: MapLine[];
  stops: MapStop[];
  /** Ruta base de las pantallas de parada, p. ej. "/cercanias". */
  stopBasePath: string;
  vehicles?: VehiclePosition[];
  /** Al pulsar una parada; sin él, se abre su pantalla. */
  onStopClick?: (stopId: string) => void;
  /** Parada resaltada. */
  selectedStopId?: string | null;
  overlay?: ReactNode;
  panel?: ReactNode;
}) {
  return (
    <div className="relative isolate min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="absolute inset-0">
        <Canvas {...props} />
      </div>
      {overlay && (
        <div className="pointer-events-none absolute top-2 left-2 z-10">
          {overlay}
        </div>
      )}
      {panel && (
        // Ocupa todo el mapa para que el panel pueda fijar su alto en % (y arrastrarse); solo el
        // panel recibe eventos, el resto del mapa sigue siendo interactivo.
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-end">
          {panel}
        </div>
      )}
    </div>
  );
}
