import type { Metadata } from "next";
import { MissingDataNotice } from "@/components/transport/MissingDataNotice";
import { getMapData } from "@/lib/gtfs/map";
import { LiveTrainMap } from "../_components/LiveTrainMap";

export const metadata: Metadata = { title: "Mapa · Cercanías" };

// Se regenera cada hora para recoger datos GTFS nuevos sin redesplegar.
export const revalidate = 3600;

/**
 * Mapa de Cercanías: trazado de las líneas, sus paradas (pulsar una abre su pantalla) y los trenes
 * en tiempo real (pulsar uno muestra su línea, destino, posición y retraso).
 */
export default async function Page() {
  const map = await getMapData("cercanias");
  if (!map) return <MissingDataNotice modeName="Cercanías" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LiveTrainMap lines={map.lines} stops={map.stops} />
    </div>
  );
}
