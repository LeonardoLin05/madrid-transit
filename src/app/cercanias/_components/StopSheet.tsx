"use client";

import { X } from "lucide-react";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { MapStop } from "@/lib/gtfs/map";
import type { ServiceAlert } from "@/types/transport";
import { CercaniasDepartures } from "./CercaniasDepartures";
import { StopAlerts } from "./StopAlerts";

/**
 * Altos a los que se ajusta el panel al soltarlo (fracción del alto del mapa). El máximo deja ver
 * arriba la etiqueta de trenes y el botón de refrescar del mapa, que también actualiza el panel.
 */
const SNAPS = [0.3, 0.6, 0.85];
const INITIAL = 0.6;
/** Por debajo de este alto, al soltar se cierra. */
const CLOSE_BELOW = 0.18;
const MIN = 0.1;
const MAX = 0.85;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
const nearestSnap = (v: number) =>
  SNAPS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

/**
 * Panel desplegable con una parada pulsada en el mapa: lo mismo que su pantalla (avisos de sus
 * líneas, filtro por línea y próximos trenes en tiempo real), salvo el botón de refrescar, porque
 * el mapa ya tiene el suyo (`refreshKey`).
 *
 * La parte superior (asa y nombre) se arrastra para hacerlo más alto o más bajo; al soltar se
 * ajusta al alto más cercano (`SNAPS`) y, si se baja casi del todo, se cierra. Con teclado, el asa
 * cambia de alto con ↑/↓. Se cierra con ✕ o con Escape. Al cambiar de parada conserva el alto.
 */
export function StopSheet({
  stop,
  alerts,
  refreshKey,
  onClose,
}: {
  stop: MapStop;
  /** Todos los avisos del modo; se muestran los de las líneas de la parada. */
  alerts: ServiceAlert[];
  refreshKey: number;
  onClose: () => void;
}) {
  const [height, setHeight] = useState(INITIAL);
  const [dragging, setDragging] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startHeight: number; total: number }>(
    null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // La ✕ no arrastra.
    if ((e.target as HTMLElement).closest("button[data-no-drag]")) return;
    const total = sheet.current?.parentElement?.clientHeight;
    if (!total) return;
    drag.current = { startY: e.clientY, startHeight: height, total };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setHeight(clamp(d.startHeight - (e.clientY - d.startY) / d.total));
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (height < CLOSE_BELOW) onClose();
    else setHeight(nearestSnap(height));
  };
  const onHandleKey = (e: React.KeyboardEvent) => {
    const i = SNAPS.indexOf(nearestSnap(height));
    if (e.key === "ArrowUp")
      setHeight(SNAPS[Math.min(i + 1, SNAPS.length - 1)]);
    else if (e.key === "ArrowDown") {
      if (i === 0) onClose();
      else setHeight(SNAPS[i - 1]);
    } else return;
    e.preventDefault();
  };

  const lineNames = new Set(stop.lines.map((l) => l.shortName));
  const stopAlerts = alerts.filter(
    (a) =>
      a.lines.some((l) => lineNames.has(l.shortName)) ||
      a.stops.some((s) => s.id === stop.id),
  );

  return (
    <section
      ref={sheet}
      aria-label={`Parada ${stop.name}`}
      style={{ height: `${height * 100}%` }}
      className={`pointer-events-auto flex min-h-0 flex-col gap-4 rounded-t-2xl border-t border-line bg-background px-4 pb-4 ${
        dragging ? "" : "transition-[height] duration-200 ease-out"
      }`}
    >
      {/* Zona de arrastre: asa y cabecera. `touch-none` evita que el gesto haga scroll. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={`-mx-4 shrink-0 touch-none px-4 select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div
          role="slider"
          tabIndex={0}
          aria-label="Alto del panel"
          aria-orientation="vertical"
          aria-valuemin={Math.round(MIN * 100)}
          aria-valuemax={Math.round(MAX * 100)}
          aria-valuenow={Math.round(height * 100)}
          aria-valuetext={`${Math.round(height * 100)} % del mapa`}
          onKeyDown={onHandleKey}
          className="flex h-6 items-center justify-center rounded-md"
        >
          <span className="h-1.5 w-10 rounded-full bg-faint" />
        </div>
        <div className="flex items-center gap-1">
          <h2 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight">
            {stop.name}
          </h2>
          <button
            type="button"
            data-no-drag
            onClick={onClose}
            aria-label="Cerrar parada"
            title="Cerrar"
            className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-foreground active:bg-hover"
          >
            <X size={22} aria-hidden />
          </button>
        </div>
      </div>
      <StopAlerts alerts={stopAlerts} />
      <CercaniasDepartures
        key={stop.id}
        stopId={stop.id}
        lines={stop.lines}
        showRefresh={false}
        refreshKey={refreshKey}
      />
    </section>
  );
}
