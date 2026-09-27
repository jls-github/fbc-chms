import { inArray } from "drizzle-orm";
import type { MemberStatus } from "@shared/constants";
import type { DirectoryEntry, DirectoryPerson } from "@shared/schemas";
import type { Db } from "../db/client";
import { familyPhotos, members } from "../db/schema";

type MemberRow = typeof members.$inferSelect;

/** Everything shown for a person respects the sharing choices they made in the member app. */
const person = (m: MemberRow): DirectoryPerson => ({
  id: m.id,
  firstName: m.firstName,
  lastName: m.lastName,
  phone: m.dirShowPhone ? m.phone : null,
  email: m.dirShowEmail ? m.email : null,
  birthday: m.dirShowBirthday && m.birthdate ? m.birthdate.slice(5, 10) : null,
});

const byFirst = (a: MemberRow, b: MemberRow) => a.firstName.localeCompare(b.firstName);
/** Kids oldest first; unknown birthdays last. */
const byAge = (a: MemberRow, b: MemberRow) => (a.birthdate ?? "9999").localeCompare(b.birthdate ?? "9999") || byFirst(a, b);

function address(people: MemberRow[]) {
  const sharing = people.filter((m) => m.dirShowAddress && m.address1);
  const source = sharing.find((m) => !m.isChild) ?? sharing[0];
  if (!source?.address1) return null;
  return { line1: source.address1, line2: source.address2, city: source.city, state: source.state, postalCode: source.postalCode };
}

/** "Anderson", or "Smith / Jones" when the adults have different last names. */
function surnames(people: MemberRow[]) {
  const counts = new Map<string, number>();
  for (const m of people) counts.set(m.lastName, (counts.get(m.lastName) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

/**
 * Households (and people who aren't in one) A–Z by last name, for the printed
 * directory and the member app. `photoUrl` decides how photos are linked
 * (staff session URLs vs. signed URLs for the app).
 */
export async function buildDirectory(
  db: Db,
  statuses: MemberStatus[],
  photoUrl: (familyId: number, updatedAt: Date) => string | Promise<string>,
) {
  const people = await db.select().from(members).where(inArray(members.status, statuses));
  const listed = people.filter((m) => !m.directoryOptOut);

  const familyIds = [...new Set(listed.map((m) => m.familyId).filter((id): id is number => id !== null))];
  const photos = familyIds.length
    ? await db
        .select({ familyId: familyPhotos.familyId, updatedAt: familyPhotos.updatedAt })
        .from(familyPhotos)
        .where(inArray(familyPhotos.familyId, familyIds))
    : [];
  const photoFor = new Map(photos.map((p) => [p.familyId, p.updatedAt]));

  const entries: DirectoryEntry[] = [];
  for (const familyId of familyIds) {
    const household = listed.filter((m) => m.familyId === familyId);
    const adults = household.filter((m) => !m.isChild).sort(byFirst);
    const kids = household.filter((m) => m.isChild).sort(byAge);
    const names = surnames(adults.length ? adults : kids);
    const updatedAt = photoFor.get(familyId);
    entries.push({
      kind: "household",
      key: `h${familyId}`,
      householdId: familyId,
      title: names.join(" / "),
      sortName: `${names[0]} ${(adults[0] ?? kids[0])!.firstName}`,
      adults: adults.map(person),
      children: kids.map(person),
      address: address(household),
      photoUrl: updatedAt ? await photoUrl(familyId, updatedAt) : null,
    });
  }
  for (const m of listed.filter((p) => p.familyId === null)) {
    entries.push({
      kind: "individual",
      key: `m${m.id}`,
      householdId: null,
      title: m.lastName,
      sortName: `${m.lastName} ${m.firstName}`,
      adults: m.isChild ? [] : [person(m)],
      children: m.isChild ? [person(m)] : [],
      address: address([m]),
      photoUrl: null,
    });
  }
  entries.sort((a, b) => a.sortName.localeCompare(b.sortName, undefined, { sensitivity: "base" }));
  return { entries, optedOut: people.length - listed.length };
}
