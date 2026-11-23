# Madrid Transit

Web para consultar el transporte público de la Comunidad de Madrid: Metro, Metro Ligero, Cercanías, EMT y autobuses interurbanos. Pensada para el móvil, con modo claro y oscuro.

## Funcionalidades

- **Buscador de paradas** por nombre o código, en todos los modos, con las líneas de cada parada.
- **Próximas salidas** de cada parada, filtrables por línea (horario teórico del GTFS del CRTM).
- **Cercanías en tiempo real** (feeds de Renfe):
  - Llegadas con retraso o adelanto, vía, número de tren, dónde va el tren y trenes suprimidos.
  - Mapa con las líneas, las estaciones y la posición de los trenes; al pulsar una estación se abre un panel con sus próximos trenes.
  - Avisos e incidencias por línea.

## Stack

[Next.js 16](https://nextjs.org) (App Router) · React 19 · TypeScript · Tailwind CSS 4 · [MapLibre GL](https://maplibre.org) · [lucide-react](https://lucide.dev)

## Puesta en marcha

Requiere **Node.js 24**.

```bash
npm install
cp .env.example .env.local   # rellenar las URLs de los GTFS (GTFS_URL_*)
npm run gtfs:download        # descarga los GTFS en data/gtfs/raw/
npm run gtfs:process         # genera los JSON en data/gtfs/processed/
npm run dev                  # http://localhost:3000
```

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` / `npm start` | Build y servidor de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Tipos de rutas + `tsc` |
| `npm run gtfs:download` | Descarga y descomprime los GTFS configurados en `.env.local` |
| `npm run gtfs:process` | Preprocesa los GTFS a JSON. Admite modos (`-- metro emt`) y `-- --no-schedules` |

## Datos

| Origen | Uso |
|--------|-----|
| [GTFS del CRTM](https://datos.crtm.es) (Consorcio Regional de Transportes de Madrid) | Paradas, líneas, recorridos y horarios teóricos |
| [GTFS-Realtime de Renfe](https://data.renfe.com) | Cercanías: retrasos, posición de los trenes y avisos |

Los datos en tiempo real se consultan siempre desde el servidor. Este proyecto no está afiliado al CRTM ni a Renfe.

## Configuración

Variables de entorno (plantilla en `.env.example`):

| Variable | Uso |
|----------|-----|
| `GTFS_URL_<MODO>` | URL del ZIP GTFS de cada modo, para `npm run gtfs:download` |
| `GTFS_DATA_URL` | Opcional. URL base desde la que leer los JSON preprocesados en vez de `data/gtfs/processed/` |
| `GTFSRT_CERCANIAS_*` | Opcionales. Sustituyen las URLs de los feeds de Renfe |

La GitHub Action `.github/workflows/publish-gtfs.yml` regenera los JSON cada semana y los publica en GitHub Pages, de donde se pueden leer con `GTFS_DATA_URL`.

## Documentación

[docs/arquitectura.md](docs/arquitectura.md): pantallas, tiempo real, formato de los datos, estructura del código y cómo añadir un modo.
