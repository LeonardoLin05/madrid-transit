import { LineBadge } from "@/components/transport/LineBadge";
import { formatDateTime } from "@/lib/format";
import type { ServiceAlert } from "@/types/transport";

/** Un aviso de Cercanías: líneas afectadas, texto, vigencia y paradas (si las concreta). */
export function AlertCard({ alert }: { alert: ServiceAlert }) {
  return (
    <article className="flex flex-col gap-2">
      {alert.lines.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {alert.lines.map((line) => (
            <LineBadge key={line.shortName} {...line} />
          ))}
        </div>
      )}
      {alert.title && <h3 className="text-sm font-semibold">{alert.title}</h3>}
      <p className="text-sm leading-relaxed text-pretty">{alert.text}</p>
      {alert.stops.length > 0 && (
        <p className="text-xs text-muted">
          Estaciones: {alert.stops.map((s) => s.name).join(", ")}
        </p>
      )}
      {(alert.start || alert.end) && (
        <p className="text-xs text-faint">
          {alert.start && `Desde el ${formatDateTime(alert.start)}`}
          {alert.start && alert.end && " · "}
          {alert.end && `Hasta el ${formatDateTime(alert.end)}`}
        </p>
      )}
    </article>
  );
}
