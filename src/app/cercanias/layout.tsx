import type { Metadata } from "next";
import { ModeHeader } from "@/components/transport/ModeHeader";
import { getTransportMode } from "@/config/transport-modes";
import { CercaniasFooter } from "./_components/CercaniasFooter";

const mode = getTransportMode("cercanias")!;

export const metadata: Metadata = { title: mode.name };

/** Layout propio de cercanias: aquí se define la estética específica de este modo. */
export default function Layout({ children }: LayoutProps<"/cercanias">) {
  return (
    <div
      className="flex h-dvh flex-col"
      style={{ "--mode-color": mode.color } as React.CSSProperties}
    >
      <ModeHeader mode={mode} />
      {/* Zona con scroll de respaldo; `main` ocupa su alto para que las listas se ajusten al resto de la pantalla. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 py-5">
          {children}
        </main>
      </div>
      <CercaniasFooter />
    </div>
  );
}
