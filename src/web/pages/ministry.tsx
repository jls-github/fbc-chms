import { Clock, Crown, HandHeart, MapPin, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Group, Team } from "@shared/schemas";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorNotice,
  Field,
  IconButton,
  Input,
  LoadingPage,
  Modal,
  PageHeader,
  PersonLink,
  PersonPicker,
  Textarea,
  useConfirm,
  useToast,
} from "../components/ui";
import { errorMessage } from "../lib/api";
import { useForm } from "../lib/form";
import { fullName, pluralize } from "../lib/format";
import {
  useDeleteGroup,
  useDeleteTeam,
  useGroup,
  useGroupMembership,
  useGroups,
  useMembers,
  useSaveGroup,
  useSaveTeam,
  useTeam,
  useTeamMembership,
  useTeams,
} from "../lib/queries";

function AvatarStack({ people }: { people: { id: number; firstName: string; lastName: string }[] }) {
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {people.slice(0, 5).map((m) => (
          <span key={m.id} className="rounded-full ring-2 ring-white dark:ring-zinc-900">
            <Avatar person={m} size="sm" />
          </span>
        ))}
      </div>
      {people.length > 5 && <span className="ml-2 text-xs text-zinc-500">+{people.length - 5}</span>}
    </div>
  );
}

const cardLink =
  "group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xs transition hover:border-brand-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-700";

// ------------------------------------------------------------------ groups

function GroupDialog({ group, open, onClose }: { group?: Group; open: boolean; onClose: () => void }) {
  const save = useSaveGroup(group?.id);
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({
    name: group?.name ?? "",
    meetingTime: group?.meetingTime ?? "",
    meetingLocation: group?.meetingLocation ?? "",
    description: group?.description ?? "",
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? "Edit group" : "New group"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="group-form" loading={save.isPending}>
            {group ? "Save" : "Create group"}
          </Button>
        </>
      }
    >
      <form
        id="group-form"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await form.handle(async () => {
            const saved = await save.mutateAsync(form.values);
            toast(group ? "Group saved" : "Group created");
            onClose();
            if (!group) navigate(`/groups/${saved.id}`);
          });
        }}
      >
        <Field label="Name" htmlFor="name" error={form.errors.name}>
          <Input autoFocus {...form.bind("name")} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="When" htmlFor="meetingTime" error={form.errors.meetingTime}>
            <Input placeholder="Tuesdays, 7:00 PM" {...form.bind("meetingTime")} />
          </Field>
          <Field label="Where" htmlFor="meetingLocation" error={form.errors.meetingLocation}>
            <Input placeholder="Fellowship Hall" {...form.bind("meetingLocation")} />
          </Field>
        </div>
        <Field label="Description" htmlFor="description" error={form.errors.description}>
          <Textarea rows={3} {...form.bind("description")} />
        </Field>
      </form>
    </Modal>
  );
}

export function GroupsPage() {
  const { data: groups, isLoading, error } = useGroups();
  const [creating, setCreating] = useState(false);
  if (isLoading) return <LoadingPage />;
  if (error || !groups) return <ErrorNotice error={error} />;
  return (
    <>
      <PageHeader
        title="Groups"
        description="Community groups and who's in them"
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New group</Button>}
      />
      {groups.length === 0 ? (
        <Card><EmptyState icon={<UsersRound className="size-5" />} title="No groups yet" description="Create your first community group." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className={cardLink}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold group-hover:text-brand-700 dark:group-hover:text-brand-300">{g.name}</p>
                <span className="shrink-0 text-xs text-zinc-500">{pluralize(g.members.length, "member")}</span>
              </div>
              <div className="mt-2 space-y-1 text-[13px] text-zinc-500">
                {g.meetingTime && <p className="flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden />{g.meetingTime}</p>}
                {g.meetingLocation && <p className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{g.meetingLocation}</p>}
              </div>
              <div className="mt-auto pt-4"><AvatarStack people={g.members} /></div>
            </Link>
          ))}
        </div>
      )}
      <GroupDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function GroupPage() {
  const id = Number(useParams().id);
  const { data: group, isLoading, error } = useGroup(id);
  const { data: people = [] } = useMembers();
  const membership = useGroupMembership(id);
  const del = useDeleteGroup();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);

  if (isLoading) return <LoadingPage />;
  if (error || !group) return <ErrorNotice error={error} />;

  return (
    <>
      <PageHeader
        back={{ to: "/groups", label: "Groups" }}
        title={group.name}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {group.meetingTime && <span className="flex items-center gap-1.5"><Clock className="size-3.5" aria-hidden />{group.meetingTime}</span>}
            {group.meetingLocation && <span className="flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden />{group.meetingLocation}</span>}
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: `Delete ${group.name}?`, message: "Members are kept; they'll just no longer be in this group." })) {
                  await del.mutateAsync(group.id);
                  toast("Group deleted");
                  navigate("/groups");
                }
              }}
            >
              Delete
            </Button>
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>
          </>
        }
      />
      {group.description && <p className="-mt-2 mb-6 max-w-2xl text-sm whitespace-pre-line text-zinc-600 dark:text-zinc-400">{group.description}</p>}
      <Card>
        <CardHeader title="Members" description={pluralize(group.members.length, "person", "people")} />
        {group.members.length === 0 ? (
          <EmptyState icon={<UsersRound className="size-5" />} title="No one in this group yet" />
        ) : (
          <ul className="grid gap-x-6 px-5 py-2 sm:grid-cols-2">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1"><PersonLink person={m} /></div>
                <IconButton
                  label={`Remove ${fullName(m)}`}
                  onClick={() =>
                    membership.remove.mutate(m.id, {
                      onSuccess: () => toast(`${m.firstName} removed`),
                      onError: (e) => toast(errorMessage(e), "error"),
                    })
                  }
                >
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding) return;
            membership.add.mutate(adding, {
              onSuccess: () => {
                toast(`${people.find((p) => p.id === adding)?.firstName ?? "Person"} added`);
                setAdding(null);
              },
              onError: (err) => toast(errorMessage(err), "error"),
            });
          }}
        >
          <div className="flex-1">
            <PersonPicker people={people} value={adding} onChange={setAdding} excludeIds={group.members.map((m) => m.id)} placeholder="Add someone to this group…" />
          </div>
          <Button type="submit" disabled={!adding} loading={membership.add.isPending} icon={<Plus className="size-4" />}>Add</Button>
        </form>
      </Card>
      <GroupDialog key={group.updatedAt} group={group} open={editing} onClose={() => setEditing(false)} />
    </>
  );
}

// ------------------------------------------------------------------- teams

function TeamDialog({ team, open, onClose }: { team?: Team; open: boolean; onClose: () => void }) {
  const save = useSaveTeam(team?.id);
  const { data: people = [] } = useMembers();
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({ name: team?.name ?? "", description: team?.description ?? "" });
  const [leaderId, setLeaderId] = useState<number | null>(team?.leader?.id ?? null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={team ? "Edit team" : "New team"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="team-form" loading={save.isPending}>{team ? "Save" : "Create team"}</Button>
        </>
      }
    >
      <form
        id="team-form"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await form.handle(async () => {
            const saved = await save.mutateAsync({ ...form.values, leaderId });
            toast(team ? "Team saved" : "Team created");
            onClose();
            if (!team) navigate(`/teams/${saved.id}`);
          });
        }}
      >
        <Field label="Name" htmlFor="name" error={form.errors.name}>
          <Input autoFocus {...form.bind("name")} />
        </Field>
        <Field label="Leader" error={form.errors.leaderId}>
          <PersonPicker people={people} value={leaderId} onChange={setLeaderId} placeholder="Choose a leader (optional)…" />
        </Field>
        <Field label="Description" htmlFor="description" error={form.errors.description}>
          <Textarea rows={3} {...form.bind("description")} />
        </Field>
      </form>
    </Modal>
  );
}

export function TeamsPage() {
  const { data: teams, isLoading, error } = useTeams();
  const [creating, setCreating] = useState(false);
  if (isLoading) return <LoadingPage />;
  if (error || !teams) return <ErrorNotice error={error} />;
  return (
    <>
      <PageHeader
        title="Teams"
        description="Ministry teams and the people serving on them"
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New team</Button>}
      />
      {teams.length === 0 ? (
        <Card><EmptyState icon={<HandHeart className="size-5" />} title="No teams yet" description="Create a ministry team like Worship or Hospitality." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} to={`/teams/${t.id}`} className={cardLink}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold group-hover:text-brand-700 dark:group-hover:text-brand-300">{t.name}</p>
                <span className="shrink-0 text-xs text-zinc-500">{pluralize(t.members.length, "member")}</span>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[13px] text-zinc-500">
                <Crown className="size-3.5" aria-hidden />
                {t.leader ? `Led by ${fullName(t.leader)}` : "No leader assigned"}
              </p>
              <div className="mt-auto pt-4"><AvatarStack people={t.members} /></div>
            </Link>
          ))}
        </div>
      )}
      <TeamDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function RoleEditor({ teamId, memberId, role }: { teamId: number; memberId: number; role: string | null }) {
  const [value, setValue] = useState(role ?? "");
  const membership = useTeamMembership(teamId);
  const toast = useToast();
  const commit = () => {
    if ((role ?? "") === value.trim()) return;
    membership.setRole.mutate(
      { memberId, role: value.trim() || null },
      { onSuccess: () => toast("Role updated"), onError: (e) => toast(errorMessage(e), "error") },
    );
  };
  return (
    <Input
      aria-label="Role"
      placeholder="Add role"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), e.preventDefault())}
      className="h-8 w-36 border-transparent bg-transparent shadow-none hover:border-zinc-200 focus:bg-white dark:bg-transparent dark:hover:border-zinc-700 dark:focus:bg-zinc-900"
    />
  );
}

export function TeamPage() {
  const id = Number(useParams().id);
  const { data: team, isLoading, error } = useTeam(id);
  const { data: people = [] } = useMembers();
  const membership = useTeamMembership(id);
  const del = useDeleteTeam();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [role, setRole] = useState("");

  if (isLoading) return <LoadingPage />;
  if (error || !team) return <ErrorNotice error={error} />;

  return (
    <>
      <PageHeader
        back={{ to: "/teams", label: "Teams" }}
        title={team.name}
        description={
          team.leader ? (
            <span className="flex items-center gap-1.5">
              <Crown className="size-3.5" aria-hidden />
              Led by <Link to={`/people/${team.leader.id}`} className="font-medium text-zinc-700 hover:underline dark:text-zinc-300">{fullName(team.leader)}</Link>
            </span>
          ) : (
            "No leader assigned"
          )
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: `Delete ${team.name}?`, message: "Members are kept; they'll just no longer be on this team." })) {
                  await del.mutateAsync(team.id);
                  toast("Team deleted");
                  navigate("/teams");
                }
              }}
            >
              Delete
            </Button>
            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>Edit</Button>
          </>
        }
      />
      {team.description && <p className="-mt-2 mb-6 max-w-2xl text-sm whitespace-pre-line text-zinc-600 dark:text-zinc-400">{team.description}</p>}
      <Card>
        <CardHeader title="Members" description="Click a role to edit it" />
        {team.members.length === 0 ? (
          <EmptyState icon={<HandHeart className="size-5" />} title="No one on this team yet" />
        ) : (
          <ul className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
            {team.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <PersonLink person={m} suffix={team.leader?.id === m.id ? <Badge>Leader</Badge> : undefined} />
                </div>
                <RoleEditor key={`${m.id}-${m.role}`} teamId={team.id} memberId={m.id} role={m.role} />
                <IconButton
                  label={`Remove ${fullName(m)}`}
                  onClick={() =>
                    membership.remove.mutate(m.id, {
                      onSuccess: () => toast(`${m.firstName} removed`),
                      onError: (e) => toast(errorMessage(e), "error"),
                    })
                  }
                >
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid grid-cols-[1fr_auto] gap-2 border-t border-zinc-100 px-5 py-4 sm:grid-cols-[1fr_10rem_auto] dark:border-zinc-800"
          onSubmit={(e) => {
            e.preventDefault();
            if (!adding) return;
            membership.add.mutate(
              { memberId: adding, role: role.trim() || null },
              {
                onSuccess: () => {
                  toast(`${people.find((p) => p.id === adding)?.firstName ?? "Person"} added`);
                  setAdding(null);
                  setRole("");
                },
                onError: (err) => toast(errorMessage(err), "error"),
              },
            );
          }}
        >
          <PersonPicker people={people} value={adding} onChange={setAdding} excludeIds={team.members.map((m) => m.id)} placeholder="Add someone to this team…" />
          <Input aria-label="Role (optional)" placeholder="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
          <Button type="submit" disabled={!adding} loading={membership.add.isPending} icon={<Plus className="size-4" />}>Add</Button>
        </form>
      </Card>
      <TeamDialog key={team.updatedAt} team={team} open={editing} onClose={() => setEditing(false)} />
    </>
  );
}
