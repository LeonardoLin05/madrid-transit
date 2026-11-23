import { StopBrowser } from "@/components/transport/StopBrowser";

/** Pantalla principal de emt. Componentes específicos en ./_components */
export default async function Page({ searchParams }: PageProps<"/emt">) {
  return <StopBrowser modeId="emt" searchParams={await searchParams} />;
}
