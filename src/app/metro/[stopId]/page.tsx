import type { Metadata } from "next";
import { StopDetail, getStopMetadata } from "@/components/transport/StopDetail";

export async function generateMetadata({
  params,
}: PageProps<"/metro/[stopId]">): Promise<Metadata> {
  return getStopMetadata("metro", (await params).stopId);
}

/** Pantalla de una parada de metro. Componentes específicos en ../_components */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/metro/[stopId]">) {
  const [{ stopId }, { q }] = await Promise.all([params, searchParams]);
  return (
    <StopDetail
      modeId="metro"
      stopId={stopId}
      q={typeof q === "string" ? q : ""}
    />
  );
}
