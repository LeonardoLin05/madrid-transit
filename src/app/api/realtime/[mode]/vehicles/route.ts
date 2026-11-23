import { respondRealtime } from "@/lib/realtime/respond";

/** GET /api/realtime/<modo>/vehicles: posición de los vehículos en servicio (`VehiclesResponse`). */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/realtime/[mode]/vehicles">,
) {
  const { mode } = await ctx.params;
  return respondRealtime(mode, "Posición de vehículos", (provider) =>
    provider.getVehicles?.(),
  );
}
