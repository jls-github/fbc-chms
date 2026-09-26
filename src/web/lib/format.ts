import type { PersonRef } from "@shared/schemas";

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

export const initials = (p: { firstName: string; lastName: string }) =>
  `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();

/** Parses a YYYY-MM-DD date as a local calendar day (no timezone shift). */
export const parseDay = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export const formatDay = (iso: string | null, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) =>
  iso ? parseDay(iso).toLocaleDateString(undefined, opts) : "";

export const formatShortDay = (iso: string) => formatDay(iso, { month: "short", day: "numeric" });

export function age(birthdate: string | null, today = new Date()): number | null {
  if (!birthdate) return null;
  const b = parseDay(birthdate);
  let years = today.getFullYear() - b.getFullYear();
  if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) years--;
  return years;
}

export const relativeDays = (iso: string) => {
  const days = Math.round((parseDay(iso).getTime() - parseDay(new Date().toLocaleDateString("en-CA")).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};

export const todayIso = () => new Date().toLocaleDateString("en-CA");

export const sortByName = <T extends Pick<PersonRef, "firstName" | "lastName">>(list: T[]) =>
  [...list].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));

export const pluralize = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
