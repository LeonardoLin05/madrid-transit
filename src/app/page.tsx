import { TransportModeCard } from "@/components/transport/TransportModeCard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { TRANSPORT_MODES } from "@/config/transport-modes";

/** Pantalla inicial: selección del modo de transporte. */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8 sm:gap-10 sm:py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Madrid Transit
          </h1>
          <p className="text-muted">Elige un medio de transporte.</p>
        </div>
        <ThemeToggle />
      </header>

      <nav
        aria-label="Modos de transporte"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {TRANSPORT_MODES.map((mode) => (
          <TransportModeCard key={mode.id} mode={mode} />
        ))}
      </nav>
    </main>
  );
}
