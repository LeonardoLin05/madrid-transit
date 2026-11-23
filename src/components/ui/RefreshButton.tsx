"use client";

import { RotateCw } from "lucide-react";

/**
 * Botón táctil (44 px) para refrescar datos a mano. El icono gira mientras `refreshing`.
 * Con `className` se ajusta su posición (p. ej. márgenes negativos para no agrandar una fila).
 */
export function RefreshButton({
  onClick,
  refreshing = false,
  label = "Actualizar",
  className = "",
}: {
  onClick: () => void;
  refreshing?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={refreshing}
      aria-label={label}
      title={label}
      className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-foreground active:bg-hover disabled:cursor-wait ${className}`}
    >
      <RotateCw
        size={18}
        aria-hidden
        className={refreshing ? "animate-spin" : ""}
      />
    </button>
  );
}
