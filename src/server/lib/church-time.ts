/** The church's timezone; "today" for check-in is the local calendar date there, not UTC. */
export const churchTimezone = () => process.env.CHURCH_TIMEZONE ?? "America/Los_Angeles";

/** YYYY-MM-DD in the church's timezone. */
export function serviceDate(now = new Date(), timeZone = churchTimezone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The local date, weekday (0 = Sunday) and hour (0–23) in the church's timezone. */
export function churchClock(now = new Date(), timeZone = churchTimezone()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: serviceDate(now, timeZone), weekday: WEEKDAYS.indexOf(get("weekday")), hour: Number(get("hour")) % 24 };
}

/** The Sunday on or before a YYYY-MM-DD date. */
export function sundayOnOrBefore(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day.toISOString().slice(0, 10);
}
