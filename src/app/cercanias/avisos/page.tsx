import type { Metadata } from "next";
import { cercaniasProvider } from "@/lib/realtime/providers/cercanias";
import { AlertsList } from "../_components/AlertsList";

export const metadata: Metadata = { title: "Avisos · Cercanías" };

// Se regenera cada minuto; el cliente además la refresca solo (ver `AlertsList`).
export const revalidate = 60;

/** Avisos e incidencias de Cercanías Madrid (feed de avisos de Renfe). */
export default async function Page() {
  const initial = await cercaniasProvider.getAlerts().catch((err) => {
    console.error("[cercanias/avisos]", err);
    return null;
  });
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">Avisos</h2>
      <AlertsList initial={initial} />
    </section>
  );
}
