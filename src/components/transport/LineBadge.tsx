import type { StopLine } from "@/types/transport";

const SIZES = {
  sm: "min-w-9 rounded-md px-1.5 py-0.5 text-xs",
  /** Para botones táctiles (filtro de líneas). */
  lg: "inline-flex h-9 min-w-12 items-center justify-center rounded-lg px-3 text-sm",
};

/** Insignia de una línea con los colores del feed (o el color del modo si no los trae). */
export function LineBadge({
  shortName,
  color,
  textColor,
  size = "sm",
}: StopLine & { size?: keyof typeof SIZES }) {
  return (
    <span
      className={`inline-block shrink-0 text-center font-semibold text-white ${SIZES[size]}`}
      style={{
        backgroundColor: color ?? "var(--mode-color)",
        color: textColor,
      }}
    >
      {shortName}
    </span>
  );
}
