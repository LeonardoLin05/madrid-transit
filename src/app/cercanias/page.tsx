import { StopBrowser } from "@/components/transport/StopBrowser";

/** Pantalla principal de cercanias. Componentes específicos en ./_components */
export default async function Page({ searchParams }: PageProps<"/cercanias">) {
  return <StopBrowser modeId="cercanias" searchParams={await searchParams} />;
}
