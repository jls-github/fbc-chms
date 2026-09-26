import { useQueryClient } from "@tanstack/react-query";
import { Cake, CircleAlert, HandHeart, House, Mail, MapPin, Pencil, Phone, Plus, Trash2, UsersRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { MEMBER_STATUSES, MEMBER_STATUS_LABELS, type MemberStatus } from "@shared/constants";
import type { MemberDetail } from "@shared/schemas";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Checkbox,
  ErrorNotice,
  Field,
  IconButton,
  Input,
  LoadingPage,
  PageHeader,
  PersonLink,
  Select,
  StatusBadge,
  Textarea,
  useConfirm,
  useToast,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { useForm } from "../lib/form";
import { age, formatDay, fullName } from "../lib/format";
import { useDeleteMember, useFamilies, useGroups, useMember, useSaveFamily, useSaveMember, useTeams } from "../lib/queries";

function useIdParam() {
  return Number(useParams().id);
}

function InfoRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2 text-sm">
      <span className="mt-0.5 text-zinc-400">{icon}</span>
      <div className="min-w-0 flex-1 break-words text-zinc-700 dark:text-zinc-300">{children}</div>
    </div>
  );
}

/** Add/remove this person from groups and teams without leaving their profile. */
function useMembershipActions(memberId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => Promise.all(["member", "members", "groups", "group", "teams", "team", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await refresh();
      toast(msg);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };
  return {
    joinGroup: (groupId: number) => run(() => api.post(`/groups/${groupId}/members`, { memberId }), "Added to group"),
    leaveGroup: (groupId: number) => run(() => api.delete(`/groups/${groupId}/members/${memberId}`), "Removed from group"),
    joinTeam: (teamId: number, role: string) => run(() => api.post(`/teams/${teamId}/members`, { memberId, role }), "Added to team"),
    leaveTeam: (teamId: number) => run(() => api.delete(`/teams/${teamId}/members/${memberId}`), "Removed from team"),
  };
}

function MembershipsCard({ member }: { member: MemberDetail }) {
  const { data: groups = [] } = useGroups();
  const { data: teams = [] } = useTeams();
  const actions = useMembershipActions(member.id);
  const [groupId, setGroupId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [role, setRole] = useState("");
  const inGroups = new Set(member.groups.map((g) => g.id));
  const onTeams = new Set(member.teams.map((t) => t.id));

  return (
    <>
      <Card>
        <CardHeader title="Groups" description="Community groups they belong to" />
        <div className="space-y-1 px-5 py-3">
          {member.groups.length === 0 && <p className="py-1 text-sm text-zinc-500">Not in a group yet.</p>}
          {member.groups.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <UsersRound className="size-4 text-zinc-400" aria-hidden />
              <Link to={`/groups/${g.id}`} className="flex-1 truncate text-sm font-medium hover:text-brand-700 dark:hover:text-brand-300">
                {g.name}
              </Link>
              <IconButton label={`Remove from ${g.name}`} onClick={() => actions.leaveGroup(g.id)}>
                <X className="size-4" />
              </IconButton>
            </div>
          ))}
          <form
            className="flex gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (groupId) void actions.joinGroup(Number(groupId)).then(() => setGroupId(""));
            }}
          >
            <div className="flex-1">
              <Select aria-label="Add to group" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Add to a group…</option>
                {groups.filter((g) => !inGroups.has(g.id)).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={!groupId} icon={<Plus className="size-4" />}>Add</Button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="Teams" description="Where they serve" />
        <div className="space-y-1 px-5 py-3">
          {member.teams.length === 0 && <p className="py-1 text-sm text-zinc-500">Not serving on a team yet.</p>}
          {member.teams.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <HandHeart className="size-4 text-zinc-400" aria-hidden />
              <Link to={`/teams/${t.id}`} className="truncate text-sm font-medium hover:text-brand-700 dark:hover:text-brand-300">
                {t.name}
              </Link>
              {t.role && <Badge>{t.role}</Badge>}
              <span className="flex-1" />
              <IconButton label={`Remove from ${t.name}`} onClick={() => actions.leaveTeam(t.id)}>
                <X className="size-4" />
              </IconButton>
            </div>
          ))}
          <form
            className="grid grid-cols-[1fr_auto] gap-2 pt-2 sm:grid-cols-[1fr_8rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (teamId)
                void actions.joinTeam(Number(teamId), role).then(() => {
                  setTeamId("");
                  setRole("");
                });
            }}
          >
            <Select aria-label="Add to team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Add to a team…</option>
              {teams.filter((t) => !onTeams.has(t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
            <Input aria-label="Role (optional)" placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
            <Button type="submit" disabled={!teamId} icon={<Plus className="size-4" />}>Add</Button>
          </form>
        </div>
      </Card>
    </>
  );
}

export function MemberPage() {
  const id = useIdParam();
  const { data: member, isLoading, error } = useMember(id);
  const del = useDeleteMember();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const toast = useToast();

  if (isLoading) return <LoadingPage />;
  if (error || !member) return <ErrorNotice error={error} />;

  const years = age(member.birthdate);
  const address = [member.address1, member.address2, [member.city, member.state].filter(Boolean).join(", "), member.postalCode]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <PageHeader
        back={{ to: "/people", label: "People" }}
        title={
          <span className="flex items-center gap-4">
            <Avatar person={member} size="lg" />
            <span>
              <span className="block">{fullName(member)}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-2 text-sm font-normal">
                <StatusBadge status={member.status} />
                {member.isChild && <Badge>Child</Badge>}
                {years !== null && <span className="text-zinc-500">{years} years old</span>}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (
                  await confirm({
                    title: `Delete ${fullName(member)}?`,
                    message: "This removes them from the directory and from every group and team. This can't be undone. (To keep their history, set their status to Archived instead.)",
                  })
                ) {
                  await del.mutateAsync(member.id);
                  toast(`${fullName(member)} deleted`);
                  navigate("/people");
                }
              }}
            >
              Delete
            </Button>
            <ButtonLink to={`/people/${member.id}/edit`} variant="primary" icon={<Pencil className="size-4" />}>
              Edit
            </ButtonLink>
          </>
        }
      />

      {member.medicalNotes && (
        <div role="note" className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><strong className="font-semibold">Allergies & medical: </strong>{member.medicalNotes}</span>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact" />
            <div className="divide-y divide-zinc-100 px-5 py-1 dark:divide-zinc-800">
              <InfoRow icon={<Mail className="size-4" />}>
                {member.email ? <a href={`mailto:${member.email}`} className="hover:underline">{member.email}</a> : <span className="text-zinc-400">No email</span>}
              </InfoRow>
              <InfoRow icon={<Phone className="size-4" />}>
                {member.phone ? <a href={`tel:${member.phone}`} className="hover:underline">{member.phone}</a> : <span className="text-zinc-400">No phone</span>}
              </InfoRow>
              <InfoRow icon={<MapPin className="size-4" />}>
                {address ? <span className="whitespace-pre-line">{address}</span> : <span className="text-zinc-400">No address</span>}
              </InfoRow>
              <InfoRow icon={<Cake className="size-4" />}>
                {member.birthdate ? formatDay(member.birthdate, { month: "long", day: "numeric", year: "numeric" }) : <span className="text-zinc-400">No birthday</span>}
              </InfoRow>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Household"
              description={member.family ? undefined : "Not part of a household yet"}
              action={
                member.family && (
                  <Link to={`/households/${member.family.id}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                    {member.family.name}
                  </Link>
                )
              }
            />
            <div className="px-5 py-3">
              {member.household.length ? (
                <ul>
                  {member.household.map((p) => (
                    <li key={p.id}>
                      <PersonLink person={p} meta={p.isChild && p.birthdate ? `Child · age ${age(p.birthdate)}` : p.isChild ? "Child" : undefined} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 py-1 text-sm text-zinc-500">
                  <House className="size-4" aria-hidden />
                  {member.family ? "No one else in this household yet." : <Link to={`/people/${member.id}/edit`} className="text-brand-700 hover:underline dark:text-brand-300">Add them to a household</Link>}
                </p>
              )}
            </div>
          </Card>

          {member.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="px-5 py-4 text-sm whitespace-pre-line text-zinc-700 dark:text-zinc-300">{member.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <MembershipsCard member={member} />
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------- form

const NEW_HOUSEHOLD = "new";

export function MemberFormPage() {
  const params = useParams();
  const id = params.id ? Number(params.id) : undefined;
  const { data: existing, isLoading } = useMember(id ?? 0);
  if (id && isLoading) return <LoadingPage />;
  return <MemberForm key={id ?? "new"} member={id ? existing : undefined} />;
}

function MemberForm({ member }: { member?: MemberDetail }) {
  const { data: families = [] } = useFamilies();
  const save = useSaveMember(member?.id);
  const createFamily = useSaveFamily();
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({
    firstName: member?.firstName ?? "",
    lastName: member?.lastName ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    address1: member?.address1 ?? "",
    address2: member?.address2 ?? "",
    city: member?.city ?? "",
    state: member?.state ?? "",
    postalCode: member?.postalCode ?? "",
    birthdate: member?.birthdate ?? "",
    status: (member?.status ?? "guest") as MemberStatus,
    isChild: member?.isChild ?? false,
    notes: member?.notes ?? "",
    medicalNotes: member?.medicalNotes ?? "",
    directoryOptOut: member?.directoryOptOut ?? false,
    familyId: member?.familyId ? String(member.familyId) : "",
  });
  const v = form.values;

  const submit = () =>
    form.handle(async () => {
      let familyId: number | null = v.familyId ? Number(v.familyId) : null;
      if (v.familyId === NEW_HOUSEHOLD) {
        const fam = await createFamily.mutateAsync({ name: `The ${v.lastName.trim() || "New"} Family` });
        familyId = fam.id;
      }
      const saved = await save.mutateAsync({ ...v, familyId });
      toast(member ? "Changes saved" : `${fullName(saved)} added`);
      navigate(`/people/${saved.id}`);
    });

  return (
    <>
      <PageHeader
        back={member ? { to: `/people/${member.id}`, label: fullName(member) } : { to: "/people", label: "People" }}
        title={member ? `Edit ${fullName(member)}` : "Add a person"}
      />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-6"
      >
        {form.formError && !Object.keys(form.errors).length && <ErrorNotice error={new Error(form.formError)} />}
        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Basics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="firstName" error={form.errors.firstName}>
              <Input autoFocus required autoComplete="off" {...form.bind("firstName")} />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={form.errors.lastName}>
              <Input required autoComplete="off" {...form.bind("lastName")} />
            </Field>
            <Field label="Status" htmlFor="status" error={form.errors.status}>
              <Select id="status" value={v.status} onChange={(e) => form.set("status", e.target.value as MemberStatus)}>
                {MEMBER_STATUSES.map((s) => (
                  <option key={s} value={s}>{MEMBER_STATUS_LABELS[s]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Birthday" htmlFor="birthdate" error={form.errors.birthdate}>
              <Input type="date" {...form.bind("birthdate")} />
            </Field>
            <Field label="Household" htmlFor="familyId" error={form.errors.familyId} hint={v.familyId === NEW_HOUSEHOLD ? `We'll create “The ${v.lastName || "…"} Family”.` : undefined}>
              <Select
                id="familyId"
                value={v.familyId}
                onChange={(e) => form.set("familyId", e.target.value)}
              >
                <option value="">No household</option>
                <option value={NEW_HOUSEHOLD}>+ New household</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end pb-1.5">
              <Checkbox label="Child or teen" description="Excluded from adult follow-up lists" checked={v.isChild} onChange={(e) => form.set("isChild", e.target.checked)} />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-[15px] font-semibold">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="email" error={form.errors.email}>
              <Input type="email" autoComplete="off" {...form.bind("email")} />
            </Field>
            <Field label="Phone" htmlFor="phone" error={form.errors.phone}>
              <Input type="tel" autoComplete="off" {...form.bind("phone")} />
            </Field>
            <Field label="Address" htmlFor="address1" error={form.errors.address1} className="sm:col-span-2">
              <Input autoComplete="off" {...form.bind("address1")} />
            </Field>
            <Field label="Apartment, suite, etc." htmlFor="address2" error={form.errors.address2} className="sm:col-span-2">
              <Input autoComplete="off" {...form.bind("address2")} />
            </Field>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-[2fr_1fr_1fr]">
              <Field label="City" htmlFor="city" error={form.errors.city}>
                <Input autoComplete="off" {...form.bind("city")} />
              </Field>
              <Field label="State" htmlFor="state" error={form.errors.state}>
                <Input autoComplete="off" {...form.bind("state")} />
              </Field>
              <Field label="ZIP" htmlFor="postalCode" error={form.errors.postalCode}>
                <Input autoComplete="off" inputMode="numeric" {...form.bind("postalCode")} />
              </Field>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <Field
            label="Allergies & medical notes"
            htmlFor="medicalNotes"
            error={form.errors.medicalNotes}
            hint="Shown to check-in volunteers and printed on kids' name tags."
            className="mb-4"
          >
            <Input placeholder="e.g. peanut allergy, inhaler in diaper bag" {...form.bind("medicalNotes")} />
          </Field>
          <div className="mb-4">
            <Checkbox
              label="Leave out of the printed directory"
              description="For people who'd rather not have their details shared with the congregation."
              checked={v.directoryOptOut}
              onChange={(e) => form.set("directoryOptOut", e.target.checked)}
            />
          </div>
          <Field label="Notes" htmlFor="notes" error={form.errors.notes} hint="Visible to all staff.">
            <Textarea rows={4} {...form.bind("notes")} />
          </Field>
        </Card>

        <div className="flex justify-end gap-2">
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending || createFamily.isPending}>
            {member ? "Save changes" : "Add person"}
          </Button>
        </div>
      </form>
    </>
  );
}
