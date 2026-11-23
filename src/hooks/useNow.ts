"use client";

import { useEffect, useState } from "react";

/** Instante actual (ms), actualizado cada `intervalMs`, para cuentas atrás en el cliente. */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
