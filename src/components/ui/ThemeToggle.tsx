"use client";

import { Moon, Sun } from "lucide-react";
import { type Theme, useTheme } from "@/hooks/useTheme";

/** Botón para alternar entre modo claro y oscuro. La elección se guarda en localStorage. */
export function ThemeToggle() {
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = `Cambiar a modo ${next === "dark" ? "oscuro" : "claro"}`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("theme", next);
        } catch {
          // Sin almacenamiento (modo privado): el cambio solo dura esta sesión.
        }
      }}
      className="-mr-2.5 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-hover hover:text-foreground active:bg-hover"
    >
      {theme === "dark" ? (
        <Sun size={20} aria-hidden />
      ) : (
        <Moon size={20} aria-hidden />
      )}
    </button>
  );
}
