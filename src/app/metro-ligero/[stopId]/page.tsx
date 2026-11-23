import type { Metadata } from "next";
import { StopDetail, getStopMetadata } from "@/components/transport/StopDetail";

export async function generateMetadata({
  params,
}: PageProps<"/metro-ligero/[stopId]">): Promise<Metadata> {
  return getStopMetadata("metro-ligero", (await params).stopId);
}

/** Pantalla de una parada de metro-ligero. Componentes específicos en ../_components */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/metro-ligero/[stopId]">) {
  const [{ stopId }, { q }] = await Promise.all([params, searchParams]);
  return (
    <StopDetail
      modeId="metro-ligero"
      stopId={stopId}
      q={typeof q === "string" ? q : ""}
    />
  );
}
