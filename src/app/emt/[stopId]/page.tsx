import type { Metadata } from "next";
import { StopDetail, getStopMetadata } from "@/components/transport/StopDetail";

export async function generateMetadata({
  params,
}: PageProps<"/emt/[stopId]">): Promise<Metadata> {
  return getStopMetadata("emt", (await params).stopId);
}

/** Pantalla de una parada de emt. Componentes específicos en ../_components */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/emt/[stopId]">) {
  const [{ stopId }, { q }] = await Promise.all([params, searchParams]);
  return (
    <StopDetail
      modeId="emt"
      stopId={stopId}
      q={typeof q === "string" ? q : ""}
    />
  );
}
