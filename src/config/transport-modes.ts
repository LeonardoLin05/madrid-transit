import type { TransportMode, TransportModeId } from "@/types/transport";

/**
 * Catálogo de modos de transporte. Es la única fuente de verdad para:
 * - las tarjetas de la pantalla inicial,
 * - la cabecera de cada pantalla de modo,
 * - la validación del parámetro `[mode]` en `/api/realtime/[mode]`.
 *
 * Para añadir un modo: añadirlo aquí, al tipo `TransportModeId` y crear `src/app/<id>/page.tsx`.
 * Colores aproximados a la señalética del CRTM — ajustar si se dispone de los oficiales.
 */
export const TRANSPORT_MODES: readonly TransportMode[] = [
  {
    id: "metro",
    name: "Metro de Madrid",
    description: "Líneas 1–12 y Ramal",
    color: "#0067B1",
    href: "/metro",
    icon: "/icons/metro.svg",
  },
  {
    id: "metro-ligero",
    name: "Metro Ligero / Tranvía",
    description: "ML1, ML2, ML3, ML4 y Tranvía de Parla",
    color: "#3A8DDE",
    href: "/metro-ligero",
    icon: "/icons/metro-ligero.svg",
  },
  {
    id: "cercanias",
    name: "Cercanías",
    description: "Renfe Cercanías Madrid",
    color: "#E1261C",
    href: "/cercanias",
    icon: "/icons/cercanias.svg",
  },
  {
    id: "emt",
    name: "EMT Madrid",
    description: "Autobuses urbanos de Madrid capital",
    color: "#1E3E8D",
    href: "/emt",
    icon: "/icons/emt.svg",
  },
  {
    id: "interurbanos",
    name: "Interurbanos",
    description: "Autobuses interurbanos de la Comunidad de Madrid",
    color: "#8BBE3F",
    href: "/interurbanos",
    icon: "/icons/interurbanos.svg",
  },
] as const;

export function getTransportMode(id: string): TransportMode | undefined {
  return TRANSPORT_MODES.find((mode) => mode.id === id);
}

export function isTransportModeId(id: string): id is TransportModeId {
  return getTransportMode(id) !== undefined;
}
