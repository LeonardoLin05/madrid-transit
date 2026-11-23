"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  type ExpressionSpecification,
  type GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { type Theme, useTheme } from "@/hooks/useTheme";
import type { MapLine, MapStop } from "@/lib/gtfs/map";
import type { VehiclePosition } from "@/types/transport";

// Estilos vectoriales de CARTO (claro y oscuro).
const STYLES: Record<Theme, string> = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
const STOP_COLORS: Record<
  Theme,
  { fill: string; stroke: string; text: string; halo: string }
> = {
  light: {
    fill: "#ffffff",
    stroke: "#3f3f46",
    text: "#18181b",
    halo: "#ffffff",
  },
  dark: {
    fill: "#0c0c0e",
    stroke: "#e4e4e7",
    text: "#ededf0",
    halo: "#0c0c0e",
  },
};
/** Misma pila de fuentes que usan los estilos de CARTO (sus glifos solo sirven esas). */
const LABEL_FONT = [
  "Montserrat Medium",
  "Open Sans Regular",
  "Noto Sans Regular",
  "Noto Sans CJK JP Regular",
];

/** Grosor de las líneas (px); también es la separación entre las que van en paralelo. */
const LINE_WIDTH = 3;

const VEHICLE_FALLBACK_COLOR = "#71717a";
/** Prefijo de las imágenes de tren; el resto del id es el color de la línea ("train:#952585"). */
const TRAIN_IMAGE_PREFIX = "train:";
/** Trazados del icono `TrainFront` de lucide (ISC), en una rejilla de 24×24. */
const TRAIN_PATHS = [
  "M8 3.1V7a4 4 0 0 0 8 0V3.1",
  "m9 15-1-1",
  "m15 15 1-1",
  "M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z",
  "m8 19-2 3",
  "m16 19 2 3",
];

/**
 * Icono de un tren: círculo del color de su línea, borde del color del fondo del mapa y el
 * icono `TrainFront` en blanco. Se dibuja a doble resolución para pantallas de alta densidad.
 */
function trainImage(color: string, border: string, size: number) {
  const ratio = 2;
  const px = size * ratio;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  const borderWidth = 2.5 * ratio;
  ctx.beginPath();
  ctx.arc(px / 2, px / 2, px / 2 - borderWidth / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = border;
  ctx.stroke();

  // El icono ocupa ~58 % del círculo, centrado.
  const iconSize = px * 0.58;
  const scale = iconSize / 24;
  ctx.save();
  ctx.translate((px - iconSize) / 2, (px - iconSize) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.25;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of TRAIN_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();
  return { image: ctx.getImageData(0, 0, px, px), pixelRatio: ratio };
}

/** GeoJSON de los vehículos (en tiempo real), con lo necesario para pintarlos y su ventana. */
function vehiclesGeoJson(
  vehicles: VehiclePosition[] | undefined,
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: (vehicles ?? []).map((v) => ({
      type: "Feature",
      properties: {
        color: v.color ?? VEHICLE_FALLBACK_COLOR,
        vehicle: JSON.stringify(v),
      },
      geometry: { type: "Point", coordinates: [v.lon, v.lat] },
    })),
  };
}

/** Contenido de la ventana de un vehículo (DOM, nunca HTML con texto del feed). */
function vehiclePopup(v: VehiclePosition): HTMLElement {
  const root = document.createElement("div");
  root.className = "flex flex-col gap-0.5 text-xs";
  const add = (text: string, className = "") => {
    const el = document.createElement("span");
    el.className = className;
    el.textContent = text;
    root.append(el);
  };
  add(
    [v.routeShortName, `Tren ${v.id}`].filter(Boolean).join(" · "),
    "font-semibold",
  );
  if (v.headsign) add(v.headsign);
  if (v.stopName) {
    const where =
      v.status === "stopped"
        ? "En"
        : v.status === "incoming"
          ? "Llegando a"
          : "Hacia";
    add(
      `${where} ${v.stopName}${v.platform ? ` · vía ${v.platform}` : ""}`,
      "text-muted",
    );
  }
  if (v.delaySeconds !== undefined) {
    const min = Math.round(v.delaySeconds / 60);
    add(
      min > 0
        ? `Retraso: ${min} min`
        : min < 0
          ? `Adelanto: ${-min} min`
          : "Puntual",
      min > 0 ? "text-warn-fg" : "text-muted",
    );
  }
  return root;
}

/**
 * Implementación del mapa con MapLibre GL (solo cliente; se carga desde `TransitMap`).
 * Dibuja los trazados de las líneas y una marca por parada; al pulsar una parada se llama a
 * `onStopClick` o, si no se pasa, se abre su pantalla en `<stopBasePath>/<stopId>`. La parada
 * `selectedStopId` se resalta. Si se pasan `vehicles`, los pinta encima (con el color de su línea)
 * y al pulsarlos muestra sus datos. El estilo del mapa sigue el tema claro/oscuro.
 */
export default function TransitMapCanvas({
  lines,
  stops,
  stopBasePath,
  vehicles,
  onStopClick,
  selectedStopId = null,
}: {
  lines: MapLine[];
  stops: MapStop[];
  stopBasePath: string;
  vehicles?: VehiclePosition[];
  onStopClick?: (stopId: string) => void;
  selectedStopId?: string | null;
}) {
  const router = useRouter();
  // En refs para no recrear el mapa cuando cambian.
  const onStopClickRef = useRef(onStopClick);
  const selectedRef = useRef(selectedStopId);
  // Radio de las paradas (depende del tipo de puntero; lo fija la creación del mapa).
  const stopRadiusRef = useRef(7);
  const theme = useTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Tema con el que está cargado el estilo del mapa (para no recargarlo sin necesidad).
  const styleTheme = useRef<Theme>(theme);
  const currentTheme = useRef<Theme>(theme);
  /** Valor de pintura distinto para la parada seleccionada. */
  const selectedExpression = (selected: number, other: number) =>
    [
      "case",
      ["==", ["get", "id"], selectedRef.current ?? ""],
      selected,
      other,
    ] as ExpressionSpecification;
  // Últimos vehículos, para volver a pintarlos al recargar el estilo.
  const vehiclesData = useRef(vehiclesGeoJson(vehicles));

  useEffect(() => {
    currentTheme.current = theme;
  }, [theme]);
  useEffect(() => {
    onStopClickRef.current = onStopClick;
  }, [onStopClick]);

  // Crea el mapa una sola vez.
  useEffect(() => {
    const el = container.current;
    if (!el) return;

    const coords = [
      ...lines.flatMap((l) => l.points.map(([lat, lon]) => [lon, lat])),
      ...stops.map((s) => [s.lon, s.lat]),
    ];
    if (!coords.length) return;
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);

    const linesData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: lines.map((line) => ({
        type: "Feature",
        properties: { color: line.color, offset: line.offset },
        geometry: {
          type: "LineString",
          coordinates: line.points.map(([lat, lon]) => [lon, lat]),
        },
      })),
    };
    const stopsData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: stops.map((stop) => ({
        type: "Feature",
        properties: { id: stop.id, name: stop.name },
        geometry: { type: "Point", coordinates: [stop.lon, stop.lat] },
      })),
    };

    // Más fáciles de pulsar con el dedo.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const stopRadius = coarse ? 11 : 7;
    stopRadiusRef.current = stopRadius;
    const labelSize = coarse ? 13 : 12;
    const vehicleSize = coarse ? 34 : 28;

    // El worker se sirve desde public/ (ver scripts/copy-maplibre-worker.mjs): la ruta que
    // MapLibre deduce sola no es válida con el bundler de Next. Debe ser absoluta.
    setWorkerUrl(`${window.location.origin}/maplibre/maplibre-gl-worker.mjs`);

    const map = new MapLibreMap({
      container: el,
      style: STYLES[currentTheme.current],
      bounds: [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      fitBoundsOptions: { padding: 32 },
      attributionControl: { compact: true },
    });
    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    // Se vuelve a ejecutar cada vez que se carga un estilo (cambio de tema).
    map.on("style.load", () => {
      const colors = STOP_COLORS[currentTheme.current];
      map.addSource("lines", { type: "geojson", data: linesData });
      map.addLayer({
        id: "lines",
        type: "line",
        source: "lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": LINE_WIDTH,
          // Las líneas que comparten vía, en paralelo (ver `offset` en `getMapData`).
          "line-offset": ["*", ["get", "offset"], LINE_WIDTH],
          "line-opacity": 0.9,
        },
      });
      map.addSource("stops", { type: "geojson", data: stopsData });
      map.addLayer({
        id: "stops",
        type: "circle",
        source: "stops",
        paint: {
          "circle-radius": selectedExpression(stopRadius + 3, stopRadius),
          "circle-color": colors.fill,
          "circle-stroke-color": colors.stroke,
          "circle-stroke-width": selectedExpression(4, 2),
        },
      });
      // Nombre de la estación al lado de su punto. Si no cabe a la derecha prueba otros lados;
      // las que chocan entre sí se ocultan hasta acercar el mapa.
      map.addLayer({
        id: "stop-labels",
        type: "symbol",
        source: "stops",
        layout: {
          "text-field": ["get", "name"],
          "text-font": LABEL_FONT,
          "text-size": labelSize,
          "text-variable-anchor": ["left", "right", "top", "bottom"],
          "text-radial-offset": (stopRadius + 4) / labelSize,
          "text-justify": "auto",
          "text-max-width": 9,
          "text-padding": 4,
        },
        paint: {
          "text-color": colors.text,
          "text-halo-color": colors.halo,
          "text-halo-width": 1.5,
        },
      });
      map.addSource("vehicles", {
        type: "geojson",
        data: vehiclesData.current,
      });
      // Trenes: icono del color de su línea (las imágenes se crean bajo demanda, ver
      // `styleimagemissing`). Encima de todo; los nombres de estación se apartan de ellos.
      map.addLayer({
        id: "vehicles",
        type: "symbol",
        source: "vehicles",
        layout: {
          "icon-image": ["concat", TRAIN_IMAGE_PREFIX, ["get", "color"]],
          "icon-allow-overlap": true,
          // Los trenes no apartan los nombres de estación: se ven aunque haya uno encima.
          "icon-ignore-placement": true,
        },
      });
    });

    // Crea el icono de tren de cada color la primera vez que se necesita (y tras cambiar de tema,
    // porque al recargar el estilo se borran las imágenes).
    map.on("styleimagemissing", ({ id }) => {
      if (!id.startsWith(TRAIN_IMAGE_PREFIX) || map.hasImage(id)) return;
      const { image, pixelRatio } = trainImage(
        id.slice(TRAIN_IMAGE_PREFIX.length),
        STOP_COLORS[currentTheme.current].fill,
        vehicleSize,
      );
      map.addImage(id, image, { pixelRatio });
    });

    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 10,
    });
    map.on("mousemove", "stops", (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      map.getCanvas().style.cursor = "pointer";
      popup
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setText(String(feature.properties.name))
        .addTo(map);
    });
    map.on("mouseleave", "stops", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    const vehiclePopupEl = new Popup({
      closeButton: false,
      offset: vehicleSize / 2,
    });
    map.on("mouseenter", "vehicles", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "vehicles", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("click", "vehicles", (e) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      popup.remove();
      vehiclePopupEl
        .setLngLat(feature.geometry.coordinates as [number, number])
        .setDOMContent(
          vehiclePopup(JSON.parse(String(feature.properties.vehicle))),
        )
        .addTo(map);
    });

    // También al pulsar el nombre de la estación (más fácil con el dedo que el punto).
    for (const layer of ["stop-labels"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }
    map.on("click", ["stops", "stop-labels"], (e) => {
      // Un tren encima de la parada tiene prioridad (abre su ventana, no la parada).
      if (
        map.getLayer("vehicles") &&
        map.queryRenderedFeatures(e.point, { layers: ["vehicles"] }).length
      )
        return;
      const id = e.features?.[0]?.properties.id;
      if (!id) return;
      if (onStopClickRef.current) onStopClickRef.current(String(id));
      else router.push(`${stopBasePath}/${encodeURIComponent(String(id))}`);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lines, stops, stopBasePath, router]);

  // Resalta la parada seleccionada.
  useEffect(() => {
    selectedRef.current = selectedStopId;
    const map = mapRef.current;
    if (!map?.getLayer("stops")) return;
    const radius = stopRadiusRef.current;
    map.setPaintProperty(
      "stops",
      "circle-radius",
      selectedExpression(radius + 3, radius),
    );
    map.setPaintProperty(
      "stops",
      "circle-stroke-width",
      selectedExpression(4, 2),
    );
  }, [selectedStopId]);

  // Actualiza la posición de los vehículos sin recrear el mapa.
  useEffect(() => {
    vehiclesData.current = vehiclesGeoJson(vehicles);
    const source = mapRef.current?.getSource("vehicles");
    if (source?.type === "geojson")
      (source as GeoJSONSource).setData(vehiclesData.current);
  }, [vehicles]);

  // Cambia el estilo del mapa al cambiar el tema.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleTheme.current === theme) return;
    styleTheme.current = theme;
    // diff: false fuerza recargar el estilo entero (y con él, `style.load` vuelve a pintar las capas).
    map.setStyle(STYLES[theme], { diff: false });
  }, [theme]);

  return <div ref={container} className="h-full w-full" />;
}
