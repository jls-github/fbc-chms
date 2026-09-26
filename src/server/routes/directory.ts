import { createRoute } from "@hono/zod-openapi";
import { inArray } from "drizzle-orm";
import { DirectoryQuery, DirectoryResponse, type DirectoryEntry, type DirectoryPerson } from "@shared/schemas";
import { familyPhotos, members } from "../db/schema";
import { authErrors, jsonContent, security, validationError } from "../lib/openapi";
import { createRouter } from "../lib/router";
import { familyPhotoUrl } from "../lib/serializers";

type MemberRow = typeof members.$inferSelect;

const person = (m: MemberRow): DirectoryPerson => ({
  id: m.id,
  firstName: m.firstName,
  lastName: m.lastName,
  phone: m.phone,
  email: m.email,
  birthday: m.birthdate ? m.birthdate.slice(5, 10) : null,
});

const byFirst = (a: MemberRow, b: MemberRow) => a.firstName.localeCompare(b.firstName);
/** Kids oldest first; unknown birthdays last. */
const byAge = (a: MemberRow, b: MemberRow) => (a.birthdate ?? "9999").localeCompare(b.birthdate ?? "9999") || byFirst(a, b);

function address(people: MemberRow[]) {
  const withAddress = people.find((m) => !m.isChild && m.address1) ?? people.find((m) => m.address1);
  if (!withAddress?.address1) return null;
  return {
    line1: withAddress.address1,
    line2: withAddress.address2,
    city: withAddress.city,
    state: withAddress.state,
    postalCode: withAddress.postalCode,
  };
}

/** "Anderson", or "Smith / Jones" when the adults have different last names. */
function surnames(people: MemberRow[]) {
  const counts = new Map<string, number>();
  for (const m of people) counts.set(m.lastName, (counts.get(m.lastName) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

export const directoryRoutes = createRouter().openapi(
  createRoute({
    method: "get",
    path: "/directory",
    tags: ["Directory"],
    summary: "The church directory, alphabetical by last name",
    description:
      "Households (and people not in a household) whose members have one of the given statuses. People who opted out of the directory are left out.",
    security,
    request: { query: DirectoryQuery },
    responses: { 200: jsonContent(DirectoryResponse), ...authErrors, ...validationError },
  }),
  async (c) => {
    const { statuses } = c.req.valid("query");
    const { db } = c.var.deps;
    const people = await db.select().from(members).where(inArray(members.status, statuses));
    const listed = people.filter((m) => !m.directoryOptOut);

    const familyIds = [...new Set(listed.map((m) => m.familyId).filter((id): id is number => id !== null))];
    const photos = familyIds.length
      ? await db
          .select({ familyId: familyPhotos.familyId, updatedAt: familyPhotos.updatedAt })
          .from(familyPhotos)
          .where(inArray(familyPhotos.familyId, familyIds))
      : [];
    const photoFor = new Map(photos.map((p) => [p.familyId, p]));

    const entries: DirectoryEntry[] = [];
    for (const familyId of familyIds) {
      const household = listed.filter((m) => m.familyId === familyId);
      const adults = household.filter((m) => !m.isChild).sort(byFirst);
      const kids = household.filter((m) => m.isChild).sort(byAge);
      const names = surnames(adults.length ? adults : kids);
      entries.push({
        kind: "household",
        key: `h${familyId}`,
        householdId: familyId,
        title: names.join(" / "),
        sortName: `${names[0]} ${(adults[0] ?? kids[0])!.firstName}`,
        adults: adults.map(person),
        children: kids.map(person),
        address: address(household),
        photoUrl: familyPhotoUrl(familyId, photoFor.get(familyId)),
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

    return c.json({ statuses, entries, optedOut: people.length - listed.length }, 200);
  },
);
