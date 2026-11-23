// Código solo de servidor: contiene credenciales. Importar únicamente desde Route Handlers / Server Components.
import type {
  AlertsResponse,
  RealtimeResponse,
  TransportModeId,
  VehiclesResponse,
} from "@/types/transport";
import { cercaniasProvider } from "./providers/cercanias";

export { NotFoundError } from "./errors";

/**
 * Registro de proveedores de tiempo real. Cada modo implementa un `RealtimeProvider`
 * en `./providers/<modo>.ts` (cliente de su API / feed GTFS-RT) y se registra aquí.
 * Los modos sin proveedor (o sin el método pedido) devuelven 501 en `/api/realtime/[mode]/…`.
 */
export interface RealtimeProvider<M extends TransportModeId = TransportModeId> {
  /** Próximas llegadas a una parada. Lanza `NotFoundError` si la parada no existe. */
  getArrivals(stopId: string): Promise<RealtimeResponse<M>>;
  /** Posición de los vehículos en servicio. */
  getVehicles?(): Promise<VehiclesResponse<M>>;
  /** Avisos e incidencias vigentes. */
  getAlerts?(): Promise<AlertsResponse<M>>;
}

const providers: { [M in TransportModeId]?: RealtimeProvider<M> } = {
  cercanias: cercaniasProvider,
  // metro: metroProvider,
  // emt: emtProvider,
};

export function getRealtimeProvider<M extends TransportModeId>(
  mode: M,
): RealtimeProvider<M> | undefined {
  return providers[mode] as RealtimeProvider<M> | undefined;
}
