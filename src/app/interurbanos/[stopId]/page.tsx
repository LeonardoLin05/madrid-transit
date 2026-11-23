import type { Metadata } from "next";
import { StopDetail, getStopMetadata } from "@/components/transport/StopDetail";

export async function generateMetadata({
  params,
}: PageProps<"/interurbanos/[stopId]">): Promise<Metadata> {
  return getStopMetadata("interurbanos", (await params).stopId);
}

/** Pantalla de una parada de interurbanos. Componentes específicos en ../_components */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/interurbanos/[stopId]">) {
  const [{ stopId }, { q }] = await Promise.all([params, searchParams]);
  return (
    <StopDetail
      modeId="interurbanos"
      stopId={stopId}
      q={typeof q === "string" ? q : ""}
    />
  );
}
