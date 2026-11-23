import { House } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { TransportMode } from "@/types/transport";

/** Cabecera común de las pantallas de modo: volver al inicio, icono y nombre del modo, y tema. */
export function ModeHeader({ mode }: { mode: TransportMode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-t-2 border-b-line border-t-(--mode-color) bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-1.5">
        <Link
          href="/"
          aria-label="Volver al inicio"
          title="Inicio"
          className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-foreground active:bg-hover"
        >
          <House size={22} aria-hidden />
        </Link>
        <Image
          src={mode.icon}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 object-contain"
        />
        <h1 className="flex-1 truncate text-base font-semibold tracking-tight">
          {mode.name}
        </h1>
        <ThemeToggle />
      </div>
    </header>
  );
}
