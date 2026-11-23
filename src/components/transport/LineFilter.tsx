"use client";

import { Route, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StopLine } from "@/types/transport";
import { LineBadge } from "./LineBadge";

/**
 * Estado del filtro de líneas. `selected` es `null` sin filtro (todas seleccionadas) o los nombres
 * cortos de las líneas elegidas. Al pulsar una línea sin filtro se queda solo esa; pulsar más las
 * añade o quita, y con ninguna o todas se vuelve a «sin filtro».
 */
export function useLineFilter(lines: StopLine[]) {
  const [selected, setSelected] = useState<string[] | null>(null);
  const toggle = (name: string) =>
    setSelected((current) => {
      if (current === null) return lines.length === 1 ? null : [name];
      const next = current.includes(name)
        ? current.filter((n) => n !== name)
        : [...current, name];
      return next.length === 0 || next.length === lines.length ? null : next;
    });
  return {
    selected,
    toggle,
    clear: () => setSelected(null),
    /** ¿Se muestra esta línea con el filtro actual? */
    matches: (shortName: string) =>
      selected === null || selected.includes(shortName),
  };
}

/**
 * Fila de insignias de línea seleccionables. El botón ✕, al final (fuera de la zona desplazable),
 * quita el filtro. La fila hace scroll horizontal sin barra visible (también con la rueda).
 */
export function LineFilter({
  lines,
  filter,
}: {
  lines: StopLine[];
  filter: ReturnType<typeof useLineFilter>;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Sin barra de scroll, la rueda del ratón desplaza la fila en horizontal.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (
        el.scrollWidth <= el.clientWidth ||
        Math.abs(e.deltaY) <= Math.abs(e.deltaX)
      )
        return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  if (!lines.length) return null;
  return (
    <div className="flex h-11 shrink-0 items-center gap-2">
      <Route size={20} className="shrink-0 text-faint" aria-hidden />
      <div
        ref={scroller}
        role="group"
        aria-label="Filtrar por línea"
        className="flex h-full min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden"
      >
        {lines.map((line) => {
          const active =
            filter.selected === null ||
            filter.selected.includes(line.shortName);
          return (
            <button
              key={line.shortName}
              type="button"
              aria-pressed={active}
              onClick={() => filter.toggle(line.shortName)}
              className={`flex h-11 shrink-0 items-center rounded-lg transition-opacity active:opacity-70 ${active ? "" : "opacity-35 hover:opacity-70"}`}
            >
              <LineBadge {...line} size="lg" />
            </button>
          );
        })}
      </div>
      {/* Siempre ocupa su sitio (oculto sin filtro) para que la fila no cambie de tamaño. */}
      <button
        type="button"
        onClick={filter.clear}
        aria-label="Quitar filtro de líneas"
        title="Quitar filtro"
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-foreground active:bg-hover ${filter.selected ? "" : "invisible"}`}
      >
        <X size={20} aria-hidden />
      </button>
    </div>
  );
}
