import type { AttendanceReport, MemberSummary, PersonRef } from "@shared/schemas";
import type { attendanceReports, members } from "../db/schema";

type MemberRow = typeof members.$inferSelect;
type Named = { id: number; name: string };

const iso = (d: Date) => d.toISOString();

export const byName = (a: PersonRef, b: PersonRef) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

export function personRef(m: MemberRow): PersonRef {
  return {
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    status: m.status,
    isChild: m.isChild,
    birthdate: m.birthdate,
  };
}

export function memberFields(m: MemberRow) {
  return {
    ...personRef(m),
    email: m.email,
    phone: m.phone,
    address1: m.address1,
    address2: m.address2,
    city: m.city,
    state: m.state,
    postalCode: m.postalCode,
    notes: m.notes,
    medicalNotes: m.medicalNotes,
    directoryOptOut: m.directoryOptOut,
    familyId: m.familyId,
    createdAt: iso(m.createdAt),
    updatedAt: iso(m.updatedAt),
  };
}

export type MemberWithRelations = MemberRow & {
  family: Named | null;
  groupMemberships: { group: Named }[];
  teamMemberships: { role: string | null; team: Named }[];
};

export function memberSummary(m: MemberWithRelations): MemberSummary {
  return {
    ...memberFields(m),
    family: m.family ? { id: m.family.id, name: m.family.name } : null,
    groups: m.groupMemberships.map((gm) => ({ id: gm.group.id, name: gm.group.name })),
    teams: m.teamMemberships.map((tm) => ({ id: tm.team.id, name: tm.team.name, role: tm.role })),
  };
}

export function attendanceReport(r: typeof attendanceReports.$inferSelect): AttendanceReport {
  return { ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) };
}

export function timestamps(row: { createdAt: Date; updatedAt: Date }) {
  return { createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
}

/** Escapes LIKE wildcards so user input is matched literally. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/** Matches values that start with q (LIKE wildcards in q are escaped). */
export const prefixPattern = (q: string) => `${q.replace(/[\\%_]/g, "\\$&")}%`;

/** Cache-busting photo URL; the version changes whenever the photo is replaced. */
export const familyPhotoUrl = (familyId: number, photo: { updatedAt: Date } | null | undefined) =>
  photo ? `/api/v1/families/${familyId}/photo?v=${photo.updatedAt.getTime()}` : null;
