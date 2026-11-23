import { TriangleAlert } from "lucide-react";

/** Aviso de que faltan los datos GTFS preprocesados de un modo. */
export function MissingDataNotice({ modeName }: { modeName: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-bg p-4 text-sm text-warn-fg">
      <TriangleAlert size={20} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        No hay datos GTFS de {modeName}. Ejecuta{" "}
        <code>npm run gtfs:download && npm run gtfs:process</code>.
      </span>
    </p>
  );
}
