# Arquitectura y detalles técnicos

Documentación técnica de Madrid Transit. Para arrancar el proyecto, ver el [README](../README.md).

## Pantallas

1. **Inicio (`/`)**: selección del medio de transporte.
2. **Una pantalla por modo** (`/metro`, `/metro-ligero`, `/cercanias`, `/emt`, `/interurbanos`, `/urbanos`). Cada una tiene su propio layout y componentes, así que puede tener una distribución y estética distintas.

### Datos estáticos en las pantallas

Mientras no hay tiempo real, cada modo (salvo `urbanos`) tiene dos pantallas con los GTFS preprocesados:

- **`/<modo>`: búsqueda** (`StopBrowser`). El buscador en vivo (`StopSearch`, cliente) consulta `GET /api/stops/<modo>?q=<texto>` y muestra una vista previa de cada parada (nombre, código y líneas). Al elegir una, o con Enter (primera coincidencia), se abre su pantalla. `?q=` rellena el buscador.
- **`/<modo>/<stopId>`: parada** (`StopDetail`), sin buscador: nombre, líneas (insignias que filtran) y **próximas salidas teóricas**. Un botón (`RefreshButton`) las recalcula con la hora actual (`router.refresh()`) sin perder el filtro. La flecha vuelve a la búsqueda con la misma consulta. Una parada inexistente da 404.

Son pantallas comunes que cada modo puede sustituir por la suya (cada modo tiene su `page.tsx` y su `[stopId]/page.tsx`).

**Cercanías** añade un pie con tres secciones (`CercaniasFooter`, en `src/app/cercanias/_components/`): **Paradas** (la búsqueda), **Mapa** (`/cercanias/mapa`) y **Avisos** (`/cercanias/avisos`). El pie no aparece en la pantalla de una parada. El mapa (`TransitMap`, MapLibre GL con estilos vectoriales de CARTO claros u oscuros según el tema) dibuja el trazado de las líneas con sus colores y una marca por parada; al pulsar una se abre su pantalla. Los datos salen de `getMapData` (`src/lib/gtfs/map.ts`, a partir de `shapes.json`, `stops.json` y `routes.json`), así que otros modos pueden reutilizarlo. `getMapData` dibuja un solo trazado por línea (descarta el de vuelta si es el de ida al revés) y, para que las líneas que comparten vía no se tapen, les asigna un desplazamiento lateral fijo (`offset`, en carriles de 3 px, aplicado con `line-offset`): detecta qué pares comparten más de 5 km, invierte trazados para que vayan en el mismo sentido y reparte carriles. Al ser fijo, se aplica también donde la línea va sola, y si dos líneas comparten un tramo corto (< 5 km) pueden seguir solapándose ahí. Ver «Tiempo real de Cercanías» para los trenes en directo, los avisos y la pantalla de parada propia.

- `src/lib/gtfs/search.ts`: búsqueda sin acentos por nombre o código. Agrupa en estaciones las paradas de un mismo emplazamiento (p. ej. Metro: una por línea). `getStopLines` y cada resultado de búsqueda incluyen las **líneas que pasan por la parada** (en una estación, la unión de las de todas sus paradas), sin repetir y en orden numérico.
- `src/lib/gtfs/schedule.ts`: `getNextDepartures` filtra los horarios por los servicios activos hoy (calendario + excepciones), con hora de Madrid, incluyendo salidas pasada la medianoche. `getFeedStatus` avisa si el calendario del GTFS ha caducado. Con `perLine` devuelve salidas de cada línea, para poder filtrar por línea en el cliente.
- `src/components/transport/`: `StopBrowser` (búsqueda), `StopDetail` (parada), `StopSearch`, `StopDepartures` (insignias de línea seleccionables para filtrar las salidas), `DeparturesTable` y `LineBadge` (insignia de línea con los colores del feed).

Si el calendario de un GTFS caduca (ocurre cuando el CRTM no publica una versión nueva), la parada muestra un aviso y puede no tener salidas.

### Tiempo real de Cercanías

Renfe publica tres feeds GTFS-Realtime en JSON (`https://gtfsrt.renfe.com/…`, sustituibles con las variables `GTFSRT_CERCANIAS_*`):

| Feed | Uso en la app |
|------|---------------|
| `trip_updates.json` | Retraso de cada tren (y hora exacta en su próxima parada) y trenes suprimidos |
| `vehicle_positions.json` | Posición de cada tren, parada en la que está o a la que va, estado y vía (`PLATF.(n)` en la etiqueta) |
| `alerts.json` | Avisos e incidencias por línea o estación |

Los feeds cubren todos los núcleos de España; se quedan los de Madrid porque sus `trip_id`, `stop_id` y `route_id` coinciden con los del GTFS del CRTM. El proveedor (`src/lib/realtime/providers/cercanias.ts`) los descarga desde el servidor, cacheados por Next (15 s los de trenes y 60 s los avisos), y expone:

- **Llegadas a una parada** (`GET /api/realtime/cercanias?stop=<id>`): parte del horario teórico (`getUpcomingStopTimes`, incluyendo hasta 2 h atrás para los trenes retrasados) y, por `trip_id`, aplica el retraso, marca las supresiones y añade dónde está el tren y su vía. Descarta los trenes que ya han pasado (si el tren está en una parada posterior según su horario). Si no hay dato en vivo de un tren, queda como «Horario teórico».
- **Trenes** (`GET /api/realtime/cercanias/vehicles`): posición, línea, destino (vía `trips.json`), parada, vía y retraso.
- **Avisos** (`GET /api/realtime/cercanias/alerts`): los de Madrid, con sus líneas y estaciones, sin la etiqueta inicial de Renfe (`#MadC5`) y ordenados del más reciente al más antiguo.

En la interfaz:

- **Pantalla de parada** (`/cercanias/<stopId>`, propia de Cercanías): avisos de las líneas de la estación en un desplegable (`StopAlerts`) y próximos trenes en directo (`CercaniasDepartures`, refresco cada 20 s): minutos hasta la llegada estimada, hora teórica tachada si hay retraso, «En el andén» / «Llegando» / «Va por <estación>», vía, número de tren y supresiones. Mientras carga, o si el feed falla, muestra el horario teórico.
- **Mapa** (`LiveTrainMap`): los trenes (icono del color de su línea) se actualizan cada 15 s; al pulsar uno se ve su línea, destino, posición, vía y retraso. Los nombres de las estaciones se muestran aunque haya un tren encima. Al pulsar una **parada** (el punto o su nombre) se abre un panel abajo (`StopSheet`) con lo mismo que su pantalla: avisos de sus líneas, filtro por línea y próximos trenes en directo (reutiliza `StopAlerts` y `CercaniasDepartures`). No lleva botón de refrescar propio: el del mapa actualiza trenes, avisos y el panel a la vez. Se cierra con ✕ o Escape, y su parte superior (asa y nombre) se arrastra para cambiar su alto: al soltar se ajusta al 30, 60 u 85 % del mapa, y si se baja casi del todo se cierra (con teclado, ↑/↓ sobre el asa).
- **Avisos** (`/cercanias/avisos`): lista filtrable por línea, regenerada cada minuto y refrescada en el cliente.

Las tres vistas tienen además un botón para **actualizar a mano** (`RefreshButton`, en `src/components/ui/`), que llama a `refresh()` de `usePolling`: consulta en el momento y reinicia el intervalo. Como el servidor cachea los feeds (15 s / 60 s), dentro de ese margen puede devolver los mismos datos.

Para que el cruce funcione hace falta reprocesar Cercanías con horarios (`npm run gtfs:process -- cercanias`), que genera los `trip_id` y `trips.json`.

## Estilo y tema

Pensado para móvil: objetivos táctiles de 44 px (cabecera, volver, filtro de líneas, pie), «volver» a la izquierda del título, campos de texto a 16 px para evitar el zoom de iOS, zonas seguras (notch/barra inferior) y color de la barra del navegador según el tema. En el mapa, controles y marcas de parada más grandes en pantallas táctiles.

Los layouts de modo ocupan toda la altura de la pantalla y las listas largas (resultados de búsqueda y salidas de una parada) ajustan su alto al espacio restante y hacen scroll por dentro, sin que se desplace la página; el mapa también rellena ese espacio.

Diseño minimalista: paleta neutra, bordes finos, sin sombras, y el color solo como acento (color del modo, insignias de línea, avisos). Hay **modo claro y oscuro**: al primer acceso se usa el del sistema y el botón de la cabecera (`ThemeToggle`) lo alterna y lo recuerda en `localStorage`. Un script en `<head>` (`src/app/layout.tsx`) fija `data-theme` en `<html>` antes de pintar, para evitar parpadeos.

Los colores son variables semánticas definidas en `src/app/globals.css` (`bg-background`, `bg-surface`, `bg-hover`, `border-line`, `text-foreground`, `text-muted`, `text-faint`, `bg-warn-bg`, `text-ok-fg` (verde, p. ej. trenes adelantados)…) que cambian solas con el tema, así que los componentes no necesitan variantes `dark:`.

## Fuentes de datos

| Tipo | Origen | Formato | Uso |
|------|--------|---------|-----|
| Estática | GTFS del **CRTM** (Consorcio Regional de Transportes de Madrid) | ZIP con CSV | Paradas, líneas, recorridos y horarios teóricos |
| Dinámica | APIs públicas (p. ej. EMT MobilityLabs) | JSON | Llegadas en tiempo real |
| Dinámica | Feeds **GTFS-Realtime** | Protobuf (`.pb`) o JSON | Trip updates, posiciones de vehículos y alertas |

Las fuentes dinámicas se consultan **siempre desde el servidor** (Route Handlers de Next.js). Así las credenciales no llegan al navegador, se evitan problemas de CORS y todas las respuestas se normalizan al mismo formato.

## Datos GTFS estáticos

**Descarga (`scripts/download-gtfs.mts`).** Para cada modo con `GTFS_URL_<MODO>` definida en `.env.local`, descarga el ZIP y lo descomprime en `data/gtfs/raw/<modo>/` sin guardar el ZIP. Si el ZIP trae una única carpeta contenedora, se sube su contenido un nivel. Solo se conservan los ficheros de la constante `KEEP_FILES`:

| Fichero | Para qué |
|---------|----------|
| `stops.txt` | Nombres y coordenadas de paradas |
| `routes.txt` | Nombre corto y color de las líneas |
| `trips.txt` | Destino (`headsign`), línea y `shape_id` de cada viaje |
| `stop_times.txt` | Horario teórico por parada |
| `calendar.txt`, `calendar_dates.txt` | Días de servicio y excepciones |
| `shapes.txt` | Trazado de las rutas, para dibujarlas en un mapa |

El resto (`agency.txt`, `feed_info.txt`…) se descarta. Si hace falta otro, se añade a `KEEP_FILES` y se vuelve a descargar.

**Preprocesado (`scripts/process-gtfs.mts`).** Lee `raw/` en streaming (algunos ficheros pesan cientos de MB) y escribe en `data/gtfs/processed/<modo>/`:

| Fichero | Contenido |
|---------|-----------|
| `stops.json` | `stop_id → { name, lat, lon, code?, parent?, station?, routes? }`. `station` marca las estaciones (agrupan paradas); `routes` son los `route_id` de las líneas que pasan por la parada. Excluye los accesos |
| `routes.json` | `route_id → { shortName, longName, color, textColor, type }`. En `longName`, los guiones que separan estaciones se sustituyen por « → » con espacios (`Origen → Destino`); los que forman parte del nombre de una estación (`Aeropuerto-T4`) se respetan |
| `shapes.json` | `route_id → direction_id → { shapeId, points }`: el trazado más usado de cada línea y sentido, simplificado (~5 m) |
| `services.json` | `service_id → { days, start, end, added, removed }`: calendarios y excepciones |
| `schedules/<stop_id>.json` | Un fichero por parada: `[segundos, route_id, headsign, service_id, trip_id?][]`, ordenado por hora (puede superar 86400 en servicios de madrugada). El `stop_id` va con `encodeURIComponent`. El `headsign` va vacío cuando es el nombre largo de la línea (se completa con `routes.json` al leer; así las estaciones grandes de Cercanías no pasan de 2 MB). El `trip_id` solo se incluye en los modos de `TRIP_ID_MODES` (Cercanías), para cruzarlos con el tiempo real |
| `trips.json` | Solo en `TRIP_ID_MODES`: `trip_id → route_id` (o `[route_id, headsign]` si el destino no es el nombre largo de la línea), para saber la línea de cada tren en directo |

Notas:
- Los JSON se escriben compactos (sin espacios ni saltos de línea) para que pesen lo mínimo: en producción Next solo cachea respuestas de hasta 2 MB. Para leerlos, `npx prettier --parser json` o `jq .`.
- Los horarios son lo más pesado (EMT ~90 MB, interurbanos ~110 MB). Con `--no-schedules` se omiten `services.json` y la carpeta `schedules/`.
- Cercanías no trae `direction_id` ni `trip_headsign`: cada línea del feed ya es un sentido (se usa la dirección `"0"`) y como destino se usa el nombre largo de la línea.
- Ambas carpetas (`raw/`, `processed/`) están en `.gitignore`; se regeneran con los scripts.

## Lectura de los datos

`src/lib/gtfs/store.ts` expone `getStops`, `getRoutes`, `getShapes`, `getServices`, `getTrips` y `getSchedule(modo, stopId)`:
- Con `GTFS_DATA_URL` definida hace `fetch` a esa URL, cacheado por Next 1 h (solo ficheros de menos de 2 MB; hoy, todos salvo `interurbanos/shapes.json`).
- Sin ella lee de `data/gtfs/processed/`.

Los datos no se empaquetan con la app (`next.config.ts` excluye `data/` con `outputFileTracingExcludes`): en un servidor sin `data/gtfs/processed/` hay que definir `GTFS_DATA_URL`. El workflow `.github/workflows/publish-gtfs.yml` los regenera cada lunes (y a mano con *Run workflow*) y los publica en GitHub Pages sin hacer commits; necesita las URLs de los GTFS como secretos `GTFS_URL_*` y *Settings → Pages → Source: GitHub Actions*.

## Estructura de carpetas

```
madrid-transit/
├── data/
│   └── gtfs/
│       ├── raw/<modo>/     # CSV del GTFS descomprimidos, solo los ficheros necesarios (ignorado por git)
│       └── processed/<modo>/  # JSON preprocesados: stops, routes, shapes… (ignorado por git)
├── public/                 # Ficheros estáticos servidos tal cual
│   └── icons/              #   un SVG por modo: <id>.svg (metro.svg, metro-ligero.svg…), usados en la pantalla de inicio
├── scripts/                # Scripts de Node fuera de la app (.mts, Node 24 los ejecuta directamente)
│   ├── download-gtfs.mts   #   descarga, descomprime y filtra los GTFS
│   ├── process-gtfs.mts    #   raw/ → processed/ (JSON compactos)
├── src/
│   ├── app/                # Rutas (App Router). Cada carpeta es un segmento de URL
│   │   ├── layout.tsx      # Layout raíz (html, fuentes, metadatos)
│   │   ├── page.tsx        # Pantalla inicial: selección de transporte
│   │   ├── globals.css     # Estilos globales y tokens de Tailwind
│   │   ├── api/
│   │   │   ├── realtime/[mode]/route.ts   # GET /api/realtime/<modo>?stop=<id> (+ vehicles/ y alerts/)
│   │   │   └── stops/[mode]/route.ts      # GET /api/stops/<modo>?q=<texto> (búsqueda de paradas)
│   │   ├── metro/          # Pantalla de Metro
│   │   │   ├── layout.tsx  #   cabecera y estética propia del modo
│   │   │   ├── page.tsx    #   búsqueda de paradas del modo
│   │   │   ├── [stopId]/page.tsx  # pantalla de una parada (/metro/<stopId>)
│   │   │   └── _components/#   componentes exclusivos de este modo (no son rutas)
│   │   ├── metro-ligero/   # (misma estructura)
│   │   ├── cercanias/      # además: mapa/, avisos/ y _components/ (pie, llegadas en directo, avisos, mapa con trenes)
│   │   ├── emt/
│   │   ├── interurbanos/
│   │   └── urbanos/
│   ├── components/
│   │   ├── ui/             # Componentes genéricos reutilizables (botones, tarjetas, spinners…)
│   │   └── transport/      # Componentes de dominio compartidos entre modos (cabecera, tarjeta de modo, StopBrowser, DeparturesTable…)
│   ├── config/
│   │   └── transport-modes.ts  # Catálogo de modos: nombre, color, ruta. Fuente única de verdad
│   ├── hooks/              # Hooks de React para cliente (usePolling; useRealtime, useVehicles, useAlerts; useNow)
│   ├── lib/                # Lógica sin UI
│   │   ├── gtfs/           # Parseo de CSV y acceso a los datos preprocesados (store.ts: local o GTFS_DATA_URL)
│   │   ├── gtfs-rt/        # Descarga y decodificación de feeds GTFS-Realtime (.pb / .json)
│   │   └── realtime/       # Proveedores de tiempo real por modo + registro (solo servidor)
│   │       ├── respond.ts  #   respuesta común de las rutas /api/realtime (errores 404/501/502)
│   │       └── providers/  #   un fichero por modo/API: cercanias.ts (Renfe GTFS-RT JSON)…
│   └── types/              # Tipos TypeScript compartidos
│       ├── transport.ts    #   modelo de dominio normalizado (ver «Tipos por modo»)
│       ├── gtfs.ts         #   filas de las tablas GTFS (CSV)
│       └── gtfs-processed.ts #  formato de los JSON de processed/
├── .github/workflows/publish-gtfs.yml  # Semanal: genera los JSON de datos y los publica en GitHub Pages
├── docs/arquitectura.md    # Este documento
├── .env.example            # Plantilla de variables de entorno
└── next.config.ts, tsconfig.json, eslint.config.mjs, package.json
```

## Flujo de datos

```
GTFS CRTM (.zip) ── gtfs:download ──► raw/ ── gtfs:process ──► data/gtfs/processed ──► lib/gtfs ──► Server Components
                                                                         │
APIs / GTFS-RT ──► lib/gtfs-rt + lib/realtime/providers ──► /api/realtime/[mode] ──► useRealtime (cliente)
```

## Tipos por modo

Cada modo puede exponer datos propios en sus llegadas (p. ej. Cercanías: estado del tren y vía) sin afectar a los demás. En `src/types/transport.ts`:

- `ArrivalBase`: campos comunes a todos los modos (línea, destino, hora estimada, si es tiempo real).
- `ArrivalExtras`: mapa `modo → datos propios`. Es el punto de extensión.
- `Arrival<M>` y `RealtimeResponse<M>` se derivan de lo anterior; `RealtimeProvider<M>` y `useRealtime(mode, …)` son genéricos.

```ts
const { data } = useRealtime("cercanias", stopId);
data?.arrivals[0].status;       // "stopped" | "arriving" | "moving" | undefined (sin posición)
data?.arrivals[0].platform;     // string | undefined (vía)
data?.arrivals[0].delaySeconds; // number | undefined
data?.arrivals[0].canceled;     // true si el tren está suprimido
```

Para añadir un dato nuevo a un modo se añade una línea en `ArrivalExtras[<modo>]` (opcional con `?` si no todas las fuentes lo ofrecen). Si es común a todos, va en `ArrivalBase`.

## Añadir un nuevo modo de transporte

1. Añadir el id a `TransportModeId` y una entrada a `ArrivalExtras` en `src/types/transport.ts`.
2. Añadir su entrada en `src/config/transport-modes.ts` (incluye `icon`) y su icono en `public/icons/<id>.svg`.
3. Crear `src/app/<id>/layout.tsx`, `page.tsx` y `_components/`.
4. (Opcional) Implementar su proveedor en `src/lib/realtime/providers/<id>.ts` (`getArrivals` y, si la fuente lo ofrece, `getVehicles` y `getAlerts`) y registrarlo en `src/lib/realtime/index.ts`.
