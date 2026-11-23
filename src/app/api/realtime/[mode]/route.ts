import { respondRealtime } from "@/lib/realtime/respond";

/**
 * GET /api/realtime/<modo>?stop=<stopId>
 * Proxy de servidor hacia las APIs/feeds de tiempo real: oculta credenciales,
 * evita CORS y normaliza la respuesta a `RealtimeResponse`.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/realtime/[mode]">,
) {
  const { mode } = await ctx.params;
  const stopId = new URL(request.url).searchParams.get("stop");
  if (!stopId) {
    return Response.json(
      { error: "Falta el parámetro 'stop'" },
      { status: 400 },
    );
  }
  return respondRealtime(mode, "Llegadas", (provider) =>
    provider.getArrivals(stopId),
  );
}
