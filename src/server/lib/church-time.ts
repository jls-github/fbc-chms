/** The church's timezone; "today" for check-in is the local calendar date there, not UTC. */
export const churchTimezone = () => process.env.CHURCH_TIMEZONE ?? "America/Los_Angeles";

/** YYYY-MM-DD in the church's timezone. */
export function serviceDate(now = new Date(), timeZone = churchTimezone()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
