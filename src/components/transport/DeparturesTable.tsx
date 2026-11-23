import type { ScheduledDeparture } from "@/types/transport";
import { LineBadge } from "./LineBadge";

/** Lista de salidas teóricas de una parada. */
export function DeparturesTable({
  departures,
  emptyMessage = "No hay salidas programadas próximas en esta parada.",
}: {
  departures: ScheduledDeparture[];
  emptyMessage?: string;
}) {
  if (!departures.length) {
    return <p className="text-sm text-muted">{emptyMessage}</p>;
  }
  return (
    <ul
      tabIndex={0}
      aria-label="Próximas salidas"
      className="flex-1 min-h-0 divide-y divide-line overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface scrollbar-thin"
    >
      {departures.map((d, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <LineBadge
            shortName={d.routeShortName}
            color={d.color}
            textColor={d.textColor}
          />
          <span className="flex-1 truncate text-[15px]">{d.headsign}</span>
          <span className="text-right tabular-nums">
            <span className="text-sm font-medium">
              {d.minutesUntil < 1
                ? "Ahora"
                : d.minutesUntil < 60
                  ? `${d.minutesUntil} min`
                  : d.time}
            </span>
            <span className="block text-xs text-muted">
              {d.time}
              {d.tomorrow && " (mañana)"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
