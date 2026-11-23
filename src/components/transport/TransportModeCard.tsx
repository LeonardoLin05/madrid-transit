import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { TransportMode } from "@/types/transport";

/** Tarjeta de la pantalla inicial que enlaza con la pantalla de un modo. */
export function TransportModeCard({ mode }: { mode: TransportMode }) {
  return (
    <Link
      href={mode.href}
      className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:bg-hover"
      style={{ "--mode-color": mode.color } as React.CSSProperties}
    >
      {/* Decorativo: el nombre del modo ya está en el texto de la tarjeta. */}
      <Image
        src={mode.icon}
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 object-contain"
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium tracking-tight">{mode.name}</span>
        <span className="truncate text-sm text-muted">{mode.description}</span>
      </span>
      <ChevronRight
        aria-hidden
        size={18}
        className="ml-auto shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-(--mode-color)"
      />
    </Link>
  );
}
