"use client";

import { Map as MapIcon, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SEARCH_PATH = "/cercanias";
const MAP_PATH = "/cercanias/mapa";
const ALERTS_PATH = "/cercanias/avisos";

const ITEMS = [
  { href: SEARCH_PATH, label: "Paradas", icon: Search },
  { href: MAP_PATH, label: "Mapa", icon: MapIcon },
  { href: ALERTS_PATH, label: "Avisos", icon: TriangleAlert },
];

/**
 * Pie de Cercanías con tres secciones: paradas (búsqueda), mapa (con los trenes en directo) y
 * avisos. Solo se muestra en esas pantallas; en la de una parada (`/cercanias/<stopId>`) no aparece.
 */
export function CercaniasFooter() {
  const pathname = usePathname();
  if (!ITEMS.some((item) => item.href === pathname)) return null;
  const items = ITEMS.map((item) => ({
    ...item,
    active: item.href === pathname,
  }));

  return (
    <footer className="sticky bottom-0 z-10 border-t border-line bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <nav
        aria-label="Secciones de Cercanías"
        className="mx-auto flex max-w-2xl"
      >
        {items.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium active:bg-hover ${
              active ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon
              size={22}
              aria-hidden
              className={active ? "text-(--mode-color)" : ""}
            />
            {label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
