import { StopBrowser } from "@/components/transport/StopBrowser";

/** Pantalla principal de interurbanos. Componentes específicos en ./_components */
export default async function Page({
  searchParams,
}: PageProps<"/interurbanos">) {
  return (
    <StopBrowser modeId="interurbanos" searchParams={await searchParams} />
  );
}
