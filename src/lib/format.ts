// Formato de fechas y horas en la zona de Madrid (válido en servidor y cliente).

const TIMEZONE = "Europe/Madrid";

const timeFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateTimeFormat = new Intl.DateTimeFormat("es-ES", {
  timeZone: TIMEZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "HH:MM" en hora de Madrid. */
export const formatTime = (date: string | number | Date) =>
  timeFormat.format(new Date(date));

/** "23 nov, 18:21" en hora de Madrid. */
export const formatDateTime = (date: string | number | Date) =>
  dateTimeFormat.format(new Date(date));

/** Destino de un `headsign` del tipo "Origen → Destino" (o el texto tal cual). */
export const destinationOf = (headsign: string) =>
  headsign.split("→").pop()!.trim() || headsign;
