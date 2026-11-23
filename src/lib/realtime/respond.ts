// Código solo de servidor. Respuesta común de las rutas `/api/realtime/[mode]/…`.
import { isTransportModeId } from "@/config/transport-modes";
import type { TransportModeId } from "@/types/transport";
import { getRealtimeProvider, NotFoundError, type RealtimeProvider } from ".";

/**
 * Valida el modo, busca su proveedor y ejecuta `run`. Normaliza los errores:
 * 404 (modo o recurso desconocido), 501 (sin proveedor o sin ese método) y 502 (fallo de la fuente).
 * `run` devuelve `undefined` si el proveedor no implementa lo pedido.
 */
export async function respondRealtime(
  mode: string,
  label: string,
  run: (provider: RealtimeProvider<TransportModeId>) => Promise<unknown> | undefined,
): Promise<Response> {
  if (!isTransportModeId(mode)) {
    return Response.json({ error: `Modo desconocido: ${mode}` }, { status: 404 });
  }
  const provider = getRealtimeProvider(mode);
  const pending = provider && run(provider);
  if (!pending) {
    return Response.json(
      { error: `${label} en tiempo real no disponible para ${mode}` },
      { status: 501 },
    );
  }
  try {
    return Response.json(await pending);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return Response.json({ error: `No existe: ${err.message}` }, { status: 404 });
    }
    console.error(`[realtime:${mode}] ${label}`, err);
    return Response.json(
      { error: "Error consultando la fuente de tiempo real" },
      { status: 502 },
    );
  }
}
