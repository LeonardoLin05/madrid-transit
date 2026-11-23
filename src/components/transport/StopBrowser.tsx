import { getTransportMode } from "@/config/transport-modes";
import { getStops } from "@/lib/gtfs/store";
import type { TransportModeId } from "@/types/transport";
import { MissingDataNotice } from "./MissingDataNotice";
import { StopSearch } from "./StopSearch";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * Pantalla de búsqueda de paradas de un modo (`/<modo>`): buscador en vivo (`StopSearch`, que también muestra el aviso inicial y los resultados con scroll).
 * Al elegir una parada se abre su pantalla propia, `/<modo>/<stopId>` (ver `StopDetail`).
 * `?q=` rellena el buscador (así se vuelve a la búsqueda desde la parada).
 */
export async function StopBrowser({
  modeId,
  searchParams,
}: {
  modeId: TransportModeId;
  searchParams: SearchParams;
}) {
  const mode = getTransportMode(modeId)!;
  const q = first(searchParams.q).trim();

  if (!(await getStops(modeId)))
    return <MissingDataNotice modeName={mode.name} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StopSearch modeId={modeId} href={mode.href} initialQuery={q} />
    </div>
  );
}
