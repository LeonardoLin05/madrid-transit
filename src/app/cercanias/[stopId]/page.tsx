import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MissingDataNotice } from "@/components/transport/MissingDataNotice";
import {
  FeedExpiredNotice,
  StopHeader,
  decodeStopId,
  getStopMetadata,
  stopBackHref,
} from "@/components/transport/StopDetail";
import { getTransportMode } from "@/config/transport-modes";
import { getFeedStatus, getNextDepartures } from "@/lib/gtfs/schedule";
import { childStopIds, getStopLines } from "@/lib/gtfs/search";
import { getStops } from "@/lib/gtfs/store";
import { cercaniasProvider } from "@/lib/realtime/providers/cercanias";
import { CercaniasDepartures } from "../_components/CercaniasDepartures";
import { StopAlerts } from "../_components/StopAlerts";

const mode = getTransportMode("cercanias")!;

export async function generateMetadata({
  params,
}: PageProps<"/cercanias/[stopId]">): Promise<Metadata> {
  return getStopMetadata("cercanias", (await params).stopId);
}

/**
 * Pantalla de una parada de Cercanías: avisos de sus líneas y próximos trenes en tiempo real
 * (con el horario teórico como respaldo mientras carga o si falla el feed de Renfe).
 */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/cercanias/[stopId]">) {
  const [{ stopId: rawStopId }, { q }] = await Promise.all([
    params,
    searchParams,
  ]);
  const stopId = decodeStopId(rawStopId);

  const stops = await getStops("cercanias");
  if (!stops) return <MissingDataNotice modeName={mode.name} />;
  const stop = stops[stopId];
  if (!stop) notFound();

  const [scheduled, lines, feed, alerts] = await Promise.all([
    getNextDepartures("cercanias", stopId, { limit: 300, perLine: 15 }),
    getStopLines("cercanias", stopId),
    getFeedStatus("cercanias"),
    cercaniasProvider.getAlerts().catch((err) => {
      console.error("[cercanias] avisos", err);
      return null;
    }),
  ]);

  // Avisos de las líneas que pasan por la parada (o de la propia parada).
  const stopIds = new Set([stopId, ...childStopIds(stops, stopId)]);
  const routeIds = new Set(
    [...stopIds].flatMap((id) => stops[id]?.routes ?? []),
  );
  const stopAlerts = (alerts?.alerts ?? []).filter(
    (a) =>
      a.routeIds.some((r) => routeIds.has(r)) ||
      a.stops.some((s) => stopIds.has(s.id)),
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <StopHeader
        title={stop.name}
        backHref={stopBackHref(mode.href, typeof q === "string" ? q : "")}
      />
      <FeedExpiredNotice feed={feed} />
      <StopAlerts alerts={stopAlerts} />
      <CercaniasDepartures
        stopId={stopId}
        lines={lines ?? []}
        scheduled={scheduled ?? []}
      />
    </section>
  );
}
