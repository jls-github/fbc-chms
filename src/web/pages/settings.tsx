import { ArrowUpRight, KeyRound, Plus, Shield, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { STAFF_ROLES, USER_ROLE_LABELS, type UserRole } from "@shared/constants";
import { Badge, Button, Card, CardHeader, Checkbox, Field, IconButton, Input, Modal, PageHeader, PersonPicker, Select, useConfirm, useToast } from "../components/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../lib/api";
import { useForm } from "../lib/form";
import { formatDay } from "../lib/format";
import { useAppAccountActions, useCreateUser, useDeleteUser, useMe, useMembers, useUpdateUser, useUsers, type User } from "../lib/queries";
import { Link } from "react-router";
import type { PersonRef } from "@shared/schemas";
import { fullName } from "../lib/format";

function ChangePassword() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const form = useForm({ currentPassword: "", newPassword: "" });
  return (
    <Card>
      <CardHeader title="Password" description="Change the password you use to sign in" />
      <form
        className="grid gap-4 px-5 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const ok = await form.handle(() => api.post("/auth/password/change", form.values));
          setPending(false);
          if (ok) {
            form.setValues({ currentPassword: "", newPassword: "" });
            toast("Password changed");
          }
        }}
      >
        <Field label="Current password" htmlFor="currentPassword" error={form.errors.currentPassword}>
          <Input type="password" autoComplete="current-password" {...form.bind("currentPassword")} />
        </Field>
        <Field label="New password" htmlFor="newPassword" error={form.errors.newPassword} hint="At least 8 characters">
          <Input type="password" autoComplete="new-password" {...form.bind("newPassword")} />
        </Field>
        <Button type="submit" className="sm:mt-6.5" loading={pending} icon={<KeyRound className="size-4" />}>
          Update
        </Button>
      </form>
    </Card>
  );
}

function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const toast = useToast();
  const form = useForm({ email: "", name: "", role: "staff" as UserRole, password: "" });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a staff account"
      description="Share the temporary password with them privately; they can change it under Settings."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="user-form" loading={create.isPending}>Add account</Button>
        </>
      }
    >
      <form
        id="user-form"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await form.handle(async () => {
            await create.mutateAsync(form.values);
            toast("Account created");
            onClose();
          });
        }}
      >
        <Field label="Name" htmlFor="name" error={form.errors.name}>
          <Input autoFocus {...form.bind("name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={form.errors.email}>
          <Input type="email" autoComplete="off" {...form.bind("email")} />
        </Field>
        <Field
          label="Role"
          htmlFor="role"
          error={form.errors.role}
          hint={
            form.values.role === "volunteer"
              ? "Can only see the kids check-in roster and check kids out."
              : form.values.role === "admin"
                ? "Everything, including managing accounts."
                : "Everything except managing accounts."
          }
        >
          <Select id="role" value={form.values.role} onChange={(e) => form.set("role", e.target.value as UserRole)}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Temporary password" htmlFor="password" error={form.errors.password} hint="At least 8 characters">
          <Input type="text" autoComplete="off" {...form.bind("password")} />
        </Field>
      </form>
    </Modal>
  );
}

/** Connects a staff login to its person in the directory, so it can use the member app too. */
function LinkPersonDialog({ user, people, onClose }: { user: User; people: PersonRef[]; onClose: () => void }) {
  const { link } = useAppAccountActions();
  const toast = useToast();
  const [memberId, setMemberId] = useState<number | null>(user.memberId);
  const save = (id: number | null) =>
    link.mutate(
      { id: user.id, memberId: id },
      {
        onSuccess: () => {
          toast(id ? "Linked — they can now use the member app" : "Unlinked");
          onClose();
        },
        onError: (e) => toast(errorMessage(e), "error"),
      },
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={`Who is ${user.name ?? user.email}?`}
      description="Linking a staff login to their entry in the directory lets them use the member app (directory, sermons, group chat) with the same sign-in."
      footer={
        <>
          {user.memberId && (
            <Button variant="ghost" className="mr-auto" loading={link.isPending} onClick={() => save(null)}>
              Unlink
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!memberId || memberId === user.memberId} loading={link.isPending} onClick={() => save(memberId)}>
            Link
          </Button>
        </>
      }
    >
      <PersonPicker people={people} value={memberId} onChange={setMemberId} autoFocus />
    </Modal>
  );
}

function StaffAccounts({ me }: { me: User }) {
  const { data: users = [] } = useUsers(true);
  const update = useUpdateUser();
  const del = useDeleteUser();
  const confirm = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState<User | null>(null);
  const { data: people } = useMembers();
  const peopleById = new Map((people ?? []).map((p) => [p.id, p]));
  return (
    <Card>
      <CardHeader
        title="Staff accounts"
        description="Who can sign in to this app"
        action={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add</Button>}
      />
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {u.name ?? u.email} {u.id === me.id && <Badge className="ml-1">You</Badge>}
              </p>
              <p className="truncate text-xs text-zinc-500">{u.name ? `${u.email} · ` : ""}added {formatDay(u.createdAt.slice(0, 10))}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                <Smartphone className="size-3.5" aria-hidden />
                {u.memberId && peopleById.get(u.memberId) ? (
                  <>
                    Member app as{" "}
                    <Link to={`/people/${u.memberId}`} className="font-medium text-zinc-700 hover:underline dark:text-zinc-300">
                      {fullName(peopleById.get(u.memberId)!)}
                    </Link>
                  </>
                ) : (
                  "Not linked to a person — can't use the member app"
                )}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setLinking(u)}>
              {u.memberId ? "Change person" : "Link to person"}
            </Button>
            <div className="w-44">
              <Select
                aria-label={`Role for ${u.email}`}
                value={u.role}
                disabled={u.id === me.id}
                onChange={(e) =>
                  update.mutate(
                    { id: u.id, role: e.target.value as UserRole },
                    { onSuccess: () => toast("Role updated"), onError: (err) => toast(errorMessage(err), "error") },
                  )
                }
                className="h-8"
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>{USER_ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </div>
            <IconButton
              label={`Remove ${u.email}`}
              disabled={u.id === me.id}
              className="disabled:invisible"
              onClick={async () => {
                if (await confirm({ title: `Remove ${u.email}?`, message: "They'll be signed out and won't be able to sign in again." })) {
                  del.mutate(u.id, { onSuccess: () => toast("Account removed"), onError: (err) => toast(errorMessage(err), "error") });
                }
              }}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      {adding && <NewUserDialog open onClose={() => setAdding(false)} />}
      {linking && (
        <LinkPersonDialog
          user={linking}
          people={(people ?? []).filter((p) => !p.isChild)}
          onClose={() => setLinking(null)}
        />
      )}
    </Card>
  );
}

function UsagePrivacy() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: (usageOptOut: boolean) => api.patch("/auth/me", { usageOptOut }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      toast("Saved");
    },
    onError: (e) => toast(errorMessage(e), "error"),
  });
  if (!me) return null;
  return (
    <Card>
      <CardHeader title="Privacy" />
      <div className="px-5 py-4">
        <Checkbox
          label="Share anonymous usage statistics"
          description="Counts like “how many people used the app this week”. We never record who did what. Turning this off also removes your activity for the current day, week and month."
          checked={!me.usageOptOut}
          disabled={save.isPending}
          onChange={(e) => save.mutate(!e.target.checked)}
        />
      </div>
    </Card>
  );
}

export function SettingsPage() {
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${me.email}`} />
      <div className="space-y-6">
        <ChangePassword />
        <UsagePrivacy />
        {me.role === "admin" ? (
          <StaffAccounts me={me} />
        ) : (
          me.role === "staff" && (
            <Card className="flex items-center gap-3 px-5 py-4 text-sm text-zinc-600 dark:text-zinc-400">
              <Shield className="size-4" aria-hidden /> Ask an admin if you need another account added.
            </Card>
          )
        )}
        {me.role !== "volunteer" && <Card>
          <CardHeader title="API" description="For the mobile app and other integrations" />
          <div className="space-y-2 px-5 py-4 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Everything in this app is available through a versioned REST API at <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px] dark:bg-zinc-800">/api/v1</code>.
              Native apps sign in with <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px] dark:bg-zinc-800">POST /api/v1/auth/token</code> and send the token as a Bearer header.
            </p>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300">
              Open the interactive API reference <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </div>
        </Card>}
      </div>
    </>
  );
}
