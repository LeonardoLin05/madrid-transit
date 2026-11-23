"use client";

import type {
  AlertsResponse,
  RealtimeResponse,
  TransportModeId,
  VehiclesResponse,
} from "@/types/transport";
import { usePolling } from "./usePolling";

/**
 * Consulta periódicamente `/api/realtime/[mode]` para una parada.
 * Uso exclusivo en Client Components.
 */
export function useRealtime<M extends TransportModeId>(
  mode: M,
  stopId: string | null,
  intervalMs = 30_000,
) {
  return usePolling<RealtimeResponse<M>>(
    stopId
      ? `/api/realtime/${mode}?stop=${encodeURIComponent(stopId)}`
      : null,
    intervalMs,
  );
}

/** Posición de los vehículos de un modo (`/api/realtime/[mode]/vehicles`). */
export function useVehicles<M extends TransportModeId>(
  mode: M,
  intervalMs = 15_000,
) {
  return usePolling<VehiclesResponse<M>>(
    `/api/realtime/${mode}/vehicles`,
    intervalMs,
  );
}

/** Avisos e incidencias de un modo (`/api/realtime/[mode]/alerts`). */
export function useAlerts<M extends TransportModeId>(
  mode: M,
  intervalMs = 60_000,
) {
  return usePolling<AlertsResponse<M>>(
    `/api/realtime/${mode}/alerts`,
    intervalMs,
  );
}
