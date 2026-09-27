import clsx from "clsx";
import { Check, Link2, Mail, Phone, Smartphone, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { formatPhone } from "@shared/phone";
import type { AppAccount, InviteResponse } from "@shared/schemas";
import { InvitationDialog } from "../components/invitation-dialog";
import type { UserStatus } from "@shared/constants";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  LoadingPage,
  Modal,
  PageHeader,
  PersonPicker,
  Segmented,
  StatusBadge,
  useConfirm,
  useToast,
} from "../components/ui";
import { errorMessage } from "../lib/api";
import { formatDay, fullName, pluralize } from "../lib/format";
import { useAppAccountActions, useAppAccounts, useMembers } from "../lib/queries";

const TABS: { value: UserStatus; label: string }[] = [
  { value: "pending", label: "Waiting for review" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "disabled", label: "Turned off" },
];

function Identity({ account }: { account: Pick<AppAccount, "email" | "phone"> }) {
  return (
    <span className="flex flex-wrap gap-x-3 text-[13px] text-zinc-500">
      {account.email && (
        <span className="inline-flex items-center gap-1">
          <Mail className="size-3.5" aria-hidden /> {account.email}
        </span>
      )}
      {account.phone && (
        <span className="inline-flex items-center gap-1">
          <Phone className="size-3.5" aria-hidden /> {formatPhone(account.phone)}
        </span>
      )}
    </span>
  );
}

/** One self-signup waiting to be matched to a person in the directory. */
function PendingCard({ account }: { account: AppAccount }) {
  const { approve, reject } = useAppAccountActions();
  const { data: people = [] } = useMembers();
  const toast = useToast();
  const confirm = useConfirm();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const busy = approve.isPending || reject.isPending;

  const approveAs = (memberId: number, name: string) =>
    approve.mutate(
      { id: account.id, memberId },
      { onSuccess: () => toast(`Approved as ${name}`), onError: (e) => toast(errorMessage(e), "error") },
    );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{account.signupName ?? "Unnamed sign-up"}</p>
          <Identity account={account} />
          <p className="mt-1 text-xs text-zinc-400">Signed up {formatDay(account.createdAt.slice(0, 10))}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          icon={<X className="size-4" />}
          onClick={async () => {
            if (await confirm({ title: `Turn down ${account.signupName ?? "this sign-up"}?`, message: "Their account will be deleted and they'll be signed out.", confirmLabel: "Turn down" })) {
              reject.mutate(account.id, { onSuccess: () => toast("Sign-up turned down"), onError: (e) => toast(errorMessage(e), "error") });
            }
          }}
        >
          Turn down
        </Button>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[13px] font-medium text-zinc-600 dark:text-zinc-400">
          {account.suggestions.length ? "Is this one of these people?" : "No likely matches in the directory."}
        </p>
        <ul className="space-y-2">
          {account.suggestions.map((s) => (
            <li
              key={s.member.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div className="min-w-0 flex-1">
                <Link to={`/people/${s.member.id}`} className="font-medium hover:underline" target="_blank">
                  {fullName(s.member)}
                </Link>{" "}
                <StatusBadge status={s.member.status} />
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {s.reasons.map((r) => (
                    <Badge key={r} className={clsx(r.startsWith("Same email") || r.startsWith("Same phone") ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "")}>
                      {r}
                    </Badge>
                  ))}
                  {s.existingAccount && (
                    <Badge className="bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                      {s.existingAccount.status === "invited" ? "Has an unused invite (will be replaced)" : "Already has an account"}
                    </Badge>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || (!!s.existingAccount && s.existingAccount.status !== "invited")}
                icon={<Check className="size-4" />}
                onClick={() => approveAs(s.member.id, fullName(s.member))}
              >
                This is them
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} icon={<Link2 className="size-4" />} onClick={() => setPicking(true)}>
            Someone else…
          </Button>
          <Button
            size="sm"
            disabled={busy}
            icon={<UserPlus className="size-4" />}
            onClick={async () => {
              if (
                await confirm({
                  title: `Add ${account.signupName ?? "them"} as a new person?`,
                  message: "They'll be added to People as a guest and their account will be approved.",
                  confirmLabel: "Add and approve",
                  danger: false,
                })
              ) {
                approve.mutate(
                  { id: account.id, createMember: true },
                  { onSuccess: () => toast("Added and approved"), onError: (e) => toast(errorMessage(e), "error") },
                );
              }
            }}
          >
            Not in the directory — add them
          </Button>
        </div>
      </div>

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title={`Who is ${account.signupName ?? "this"}?`}
        footer={
          <>
            <Button onClick={() => setPicking(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!picked}
              loading={approve.isPending}
              onClick={() => {
                const p = people.find((x) => x.id === picked);
                if (p) approveAs(p.id, fullName(p));
                setPicking(false);
              }}
            >
              Approve
            </Button>
          </>
        }
      >
        <PersonPicker people={people.filter((p) => !p.isChild)} value={picked} onChange={setPicked} autoFocus />
      </Modal>
    </Card>
  );
}

function AccountRow({ account }: { account: AppAccount }) {
  const { setStatus, invite } = useAppAccountActions();
  const toast = useToast();
  const [invitation, setInvitation] = useState<InviteResponse | null>(null);
  const label = account.member ? fullName(account.member) : (account.signupName ?? account.email ?? "Account");
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {account.member ? (
            <Link to={`/people/${account.member.id}`} className="hover:underline">{label}</Link>
          ) : (
            label
          )}
          {account.role !== "member" && <Badge className="ml-2">Staff login</Badge>}
        </p>
        <Identity account={account} />
        {account.status === "invited" && account.inviteExpiresAt && (
          <p className="text-xs text-zinc-400">Invitation expires {formatDay(account.inviteExpiresAt.slice(0, 10))}</p>
        )}
      </div>
      {account.status === "invited" && account.member && (
        <Button
          size="sm"
          loading={invite.isPending}
          onClick={() => invite.mutate(account.member!.id, { onSuccess: setInvitation, onError: (e) => toast(errorMessage(e), "error") })}
        >
          New code
        </Button>
      )}
      {account.role === "member" && account.status === "active" && (
        <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: account.id, status: "disabled" }, { onSuccess: () => toast("Account turned off"), onError: (e) => toast(errorMessage(e), "error") })}>
          Turn off
        </Button>
      )}
      {account.status === "disabled" && (
        <Button size="sm" onClick={() => setStatus.mutate({ id: account.id, status: "active" }, { onSuccess: () => toast("Account turned back on"), onError: (e) => toast(errorMessage(e), "error") })}>
          Turn back on
        </Button>
      )}
      {invitation && <InvitationDialog invitation={invitation} name={label} onClose={() => setInvitation(null)} />}
    </li>
  );
}

export function AppAccountsPage() {
  const [tab, setTab] = useState<UserStatus>("pending");
  const { data, isLoading, error } = useAppAccounts(tab);
  if (isLoading) return <LoadingPage />;
  if (error || !data) return <ErrorNotice error={error} />;
  return (
    <>
      <PageHeader
        title="App accounts"
        description="People using the member app. New sign-ups wait here until you confirm who they are."
      />
      <div className="mb-4">
        <Segmented
          label="Show"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ ...t, count: t.value === "pending" ? data.pendingCount : undefined }))}
        />
      </div>
      {data.accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Smartphone className="size-5" />}
            title={tab === "pending" ? "No one is waiting for review" : "Nothing here"}
            description={tab === "invited" ? "Invite people from their profile page (People → a person → Invite to app)." : undefined}
          />
        </Card>
      ) : tab === "pending" ? (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500">{pluralize(data.accounts.length, "sign-up")} to review. Matching by email or phone is strongest — names alone can be coincidences.</p>
          {data.accounts.map((a) => (
            <PendingCard key={a.id} account={a} />
          ))}
        </div>
      ) : (
        <Card>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.accounts.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
