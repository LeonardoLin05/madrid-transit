import { respondRealtime } from "@/lib/realtime/respond";

/** GET /api/realtime/<modo>/alerts: avisos e incidencias vigentes (`AlertsResponse`). */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/realtime/[mode]/alerts">,
) {
  const { mode } = await ctx.params;
  return respondRealtime(mode, "Avisos", (provider) => provider.getAlerts?.());
}
