import { useQuery } from "@tanstack/react-query";
import type { DirectoryEntry, DirectoryPerson } from "@shared/schemas";
import { api } from "./api";

export const useDirectory = () =>
  useQuery({
    queryKey: ["directory"],
    queryFn: () => api.get<{ entries: DirectoryEntry[] }>("/app/directory").then((r) => r.entries),
    staleTime: 5 * 60_000,
  });

/** "David & Rachel", or full names when last names differ from the heading. */
export function adultNames(e: DirectoryEntry) {
  const shared = e.adults.every((a) => a.lastName === e.adults[0]?.lastName);
  const names = e.adults.map((a) => (shared ? a.firstName : `${a.firstName} ${a.lastName}`));
  return names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

export const childName = (e: DirectoryEntry, c: DirectoryPerson) => (e.title.includes(c.lastName) ? c.firstName : `${c.firstName} ${c.lastName}`);

export function matches(e: DirectoryEntry, q: string) {
  if (!q) return true;
  const hay = [e.title, ...[...e.adults, ...e.children].flatMap((p) => [p.firstName, p.lastName, p.phone, p.email])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.toLowerCase().split(/\s+/).every((part) => hay.includes(part));
}

export const formatAddress = (a: NonNullable<DirectoryEntry["address"]>) =>
  [a.line1 + (a.line2 ? `, ${a.line2}` : ""), [a.city, a.state].filter(Boolean).join(", ") + (a.postalCode ? ` ${a.postalCode}` : "")]
    .filter((l) => l.trim())
    .join("\n");
