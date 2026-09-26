const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mar 14" from "03-14". */
export const birthday = (mmdd: string) => `${MONTHS[Number(mmdd.slice(0, 2)) - 1]} ${Number(mmdd.slice(3))}`;

/** "Sep 20, 2026" from "2026-09-20". */
export const longDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

/** "9:41 AM", "Tue", or "Sep 2" depending on how long ago. */
export function chatTime(iso: string, now = new Date()) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const initials = (text: string) =>
  text
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
