import { ChevronDown, TriangleAlert } from "lucide-react";
import type { ServiceAlert } from "@/types/transport";
import { AlertCard } from "./AlertCard";

/**
 * Avisos que afectan a una parada (a sus líneas o a ella misma), plegados para no quitar sitio a
 * los trenes. Sin JavaScript: `<details>` nativo.
 */
export function StopAlerts({ alerts }: { alerts: ServiceAlert[] }) {
  if (!alerts.length) return null;
  return (
    <details className="group shrink-0 rounded-xl border border-warn-line bg-warn-bg text-warn-fg">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium active:opacity-70 [&::-webkit-details-marker]:hidden">
        <TriangleAlert size={18} className="shrink-0" aria-hidden />
        <span className="flex-1">
          {alerts.length === 1
            ? "1 aviso en las líneas de esta estación"
            : `${alerts.length} avisos en las líneas de esta estación`}
        </span>
        <ChevronDown
          size={18}
          className="shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="max-h-[40dvh] divide-y divide-warn-line overflow-y-auto overscroll-contain border-t border-warn-line text-foreground scrollbar-thin">
        {alerts.map((alert) => (
          <div key={alert.id} className="px-3 py-3">
            <AlertCard alert={alert} />
          </div>
        ))}
      </div>
    </details>
  );
}
