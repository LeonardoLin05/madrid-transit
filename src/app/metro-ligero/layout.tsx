import type { Metadata } from "next";
import { ModeHeader } from "@/components/transport/ModeHeader";
import { getTransportMode } from "@/config/transport-modes";

const mode = getTransportMode("metro-ligero")!;

export const metadata: Metadata = { title: mode.name };

/** Layout propio de metro-ligero: aquí se define la estética específica de este modo. */
export default function Layout({ children }: LayoutProps<"/metro-ligero">) {
  return (
    <div
      className="flex h-dvh flex-col"
      style={{ "--mode-color": mode.color } as React.CSSProperties}
    >
      <ModeHeader mode={mode} />
      {/* Zona con scroll de respaldo; `main` ocupa su alto para que las listas se ajusten al resto de la pantalla. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 py-5 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
