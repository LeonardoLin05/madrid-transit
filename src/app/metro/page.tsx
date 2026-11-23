import { StopBrowser } from "@/components/transport/StopBrowser";

/** Pantalla principal de metro. Componentes específicos en ./_components */
export default async function Page({ searchParams }: PageProps<"/metro">) {
  return <StopBrowser modeId="metro" searchParams={await searchParams} />;
}
