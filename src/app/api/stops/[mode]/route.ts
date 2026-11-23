import { isTransportModeId } from "@/config/transport-modes";
import { searchStops } from "@/lib/gtfs/search";

/**
 * GET /api/stops/<modo>?q=<texto>
 * Búsqueda de paradas sobre los datos GTFS preprocesados (nombre o código), con las líneas
 * que pasan por cada una. La usa el buscador en vivo de `StopSearch`.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/stops/[mode]">,
) {
  const { mode } = await ctx.params;
  if (!isTransportModeId(mode)) {
    return Response.json(
      { error: `Modo desconocido: ${mode}` },
      { status: 404 },
    );
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 100);
  try {
    const results = await searchStops(mode, q, 20);
    if (!results)
      return Response.json(
        { error: `Sin datos GTFS para ${mode}` },
        { status: 503 },
      );
    // Los datos solo cambian al actualizar el GTFS: se puede cachear en el CDN.
    return Response.json(
      { results },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (err) {
    console.error(`[stops:${mode}]`, err);
    return Response.json({ error: "Error buscando paradas" }, { status: 500 });
  }
}
