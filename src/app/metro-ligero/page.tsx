import { StopBrowser } from "@/components/transport/StopBrowser";

/** Pantalla principal de metro-ligero. Componentes específicos en ./_components */
export default async function Page({
  searchParams,
}: PageProps<"/metro-ligero">) {
  return (
    <StopBrowser modeId="metro-ligero" searchParams={await searchParams} />
  );
}
