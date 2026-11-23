"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// El tema vive en <html data-theme>; el script de layout.tsx lo fija antes de hidratar.
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}
const getSnapshot = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";
const getServerSnapshot = (): Theme => "light";

/** Tema actual (claro/oscuro), reactivo a los cambios de `ThemeToggle`. Solo en cliente. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
