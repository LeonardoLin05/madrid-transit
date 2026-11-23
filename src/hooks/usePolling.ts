"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Consulta periódicamente una URL JSON (de la propia app). Con `url` a `null` no hace nada.
 * Mantiene los últimos datos buenos aunque una consulta falle (`error` indica el fallo).
 * Pausa el sondeo con la pestaña oculta y refresca al volver.
 * `refresh()` consulta en el momento (refresco manual) y reinicia el intervalo;
 * `refreshing` es true mientras hay una consulta en curso.
 */
export function usePolling<T>(url: string | null, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Reinicia la consulta y el intervalo del efecto activo (lo asigna el efecto).
  const restart = useRef<() => void>(() => {});

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let inFlight = 0;

    async function load() {
      inFlight++;
      setRefreshing(true);
      try {
        const res = await fetch(url!);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body as T);
        setError(null);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (--inFlight === 0 && !cancelled) setRefreshing(false);
      }
    }
    const start = () => {
      clearInterval(timer);
      load();
      timer = setInterval(load, intervalMs);
    };
    const onVisibility = () => {
      if (document.hidden) clearInterval(timer);
      else start();
    };

    restart.current = start;
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(timer);
      restart.current = () => {};
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url, intervalMs]);

  const refresh = useCallback(() => restart.current(), []);

  return {
    data,
    error,
    loading: url !== null && data === null && error === null,
    refreshing,
    refresh,
  };
}
