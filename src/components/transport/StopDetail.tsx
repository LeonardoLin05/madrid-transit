import { ArrowLeft, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTransportMode } from "@/config/transport-modes";
import { getFeedStatus, getNextDepartures } from "@/lib/gtfs/schedule";
import { getStopLines } from "@/lib/gtfs/search";
import { getStops } from "@/lib/gtfs/store";
import type { TransportModeId } from "@/types/transport";
import { MissingDataNotice } from "./MissingDataNotice";
import { StopDepartures } from "./StopDepartures";

/** El `stopId` llega de la URL: se decodifica por si trae caracteres escapados. */
export function decodeStopId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Título de pestaña de la pantalla de una parada: «<parada> · <modo>». */
export async function getStopMetadata(
  modeId: TransportModeId,
  rawStopId: string,
): Promise<Metadata> {
  const stops = await getStops(modeId);
  const name = stops?.[decodeStopId(rawStopId)]?.name ?? "Parada";
  return { title: `${name} · ${getTransportMode(modeId)!.name}` };
}

/**
 * Pantalla de una parada (`/<modo>/<stopId>`): nombre, líneas y próximas salidas teóricas.
 * Sin buscador; la flecha vuelve a la búsqueda (con `q`, a la misma consulta).
 * Cada modo puede usarla tal cual o montar su propia pantalla con `StopDepartures` y `src/lib/gtfs`.
 */
export async function StopDetail({
  modeId,
  stopId: rawStopId,
  q = "",
}: {
  modeId: TransportModeId;
  stopId: string;
  q?: string;
}) {
  const mode = getTransportMode(modeId)!;
  const stopId = decodeStopId(rawStopId);

  const stops = await getStops(modeId);
  if (!stops) return <MissingDataNotice modeName={mode.name} />;
  const stop = stops[stopId];
  if (!stop) notFound();

  const [departures, lines, feed] = await Promise.all([
    getNextDepartures(modeId, stopId, { limit: 300, perLine: 15 }),
    getStopLines(modeId, stopId),
    getFeedStatus(modeId),
  ]);

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <StopHeader title={stop.name} backHref={stopBackHref(mode.href, q)} />
      <FeedExpiredNotice feed={feed} />
      <StopDepartures lines={lines ?? []} departures={departures ?? []} />
    </section>
  );
}

/** Destino de «volver» desde una parada: la búsqueda del modo, con la consulta `q` si la hay. */
export function stopBackHref(modeHref: string, q = ""): string {
  return q.trim()
    ? `${modeHref}?${new URLSearchParams({ q: q.trim() })}`
    : modeHref;
}

/** Cabecera de la pantalla de una parada: flecha de volver (a la izquierda) y nombre. */
export function StopHeader({
  title,
  backHref,
}: {
  title: string;
  backHref: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={backHref}
        aria-label="Volver a la búsqueda"
        title="Volver"
        className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-foreground active:bg-hover"
      >
        <ArrowLeft size={22} aria-hidden />
      </Link>
      <h2 className="min-w-0 text-xl font-semibold tracking-tight">{title}</h2>
    </div>
  );
}

/** Aviso de que el calendario del GTFS ha caducado (ver `getFeedStatus`). */
export function FeedExpiredNotice({
  feed,
}: {
  feed: { validUntil: string; expired: boolean } | null;
}) {
  if (!feed?.expired) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-bg p-3 text-sm text-warn-fg">
      <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        El calendario de este GTFS caducó el{" "}
        {feed.validUntil.replace(/(\d{4})(\d{2})(\d{2})/, "$3/$2/$1")}: puede
        que no haya horarios disponibles. Hay que actualizar los datos (
        <code>npm run gtfs:download</code> y <code>npm run gtfs:process</code>).
      </span>
    </p>
  );
}
