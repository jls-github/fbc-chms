import clsx from "clsx";
import { LayoutGrid, Search, Table2, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { MEMBER_STATUSES, MEMBER_STATUS_LABELS, type MemberStatus } from "@shared/constants";
import type { MemberSummary } from "@shared/schemas";
import { Avatar, Badge, ButtonLink, Card, EmptyState, ErrorNotice, Input, LoadingPage, PageHeader, Segmented, StatusBadge } from "../components/ui";
import { fullName, pluralize } from "../lib/format";
import { useMembers } from "../lib/queries";

type View = "table" | "cards";
type StatusFilter = MemberStatus | "all";

function readView(): View {
  try {
    const v = localStorage.getItem("people-view");
    return v === "cards" ? v : "table";
  } catch {
    return "table";
  }
}

function matches(m: MemberSummary, q: string) {
  if (!q) return true;
  const hay = `${m.firstName} ${m.lastName} ${m.lastName} ${m.firstName} ${m.email ?? ""} ${m.phone ?? ""} ${m.family?.name ?? ""}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((part) => hay.includes(part));
}

const Muted = ({ children }: { children: string }) => <span className="text-zinc-400 dark:text-zinc-600">{children}</span>;

function Chips({ items, empty }: { items: { id: number; name: string }[]; empty: string }) {
  if (!items.length) return <Muted>{empty}</Muted>;
  return (
    <span className="flex flex-wrap gap-1">
      {items.slice(0, 2).map((i) => (
        <Badge key={i.id}>{i.name}</Badge>
      ))}
      {items.length > 2 && <Badge>+{items.length - 2}</Badge>}
    </span>
  );
}

function PeopleTable({ people }: { people: MemberSummary[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Household</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Groups</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">Teams</th>
              <th scope="col" className="hidden px-4 py-2.5 font-medium xl:table-cell">Phone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {people.map((m) => (
              <tr key={m.id} className="group relative hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <td className="px-4 py-2.5">
                  <Link to={`/people/${m.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                    <Avatar person={m} size="sm" />
                    <span className="min-w-0">
                      <span className="block font-medium text-zinc-900 group-hover:text-brand-700 dark:text-zinc-100 dark:group-hover:text-brand-300">
                        {fullName(m)}
                        {m.isChild && <Badge className="ml-2 align-middle">Child</Badge>}
                      </span>
                      {m.email && <span className="block truncate text-xs text-zinc-500">{m.email}</span>}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={m.status} />
                </td>
                <td className="hidden px-4 py-2.5 text-zinc-600 md:table-cell dark:text-zinc-400">{m.family?.name ?? <Muted>—</Muted>}</td>
                <td className="hidden px-4 py-2.5 lg:table-cell"><Chips items={m.groups} empty="—" /></td>
                <td className="hidden px-4 py-2.5 lg:table-cell"><Chips items={m.teams} empty="—" /></td>
                <td className="hidden px-4 py-2.5 whitespace-nowrap text-zinc-600 tabular-nums xl:table-cell dark:text-zinc-400">{m.phone ?? <Muted>—</Muted>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function PersonCard({ m }: { m: MemberSummary }) {
  return (
    <Link
      to={`/people/${m.id}`}
      className="group flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xs transition hover:border-brand-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-700"
    >
      <div className="flex items-start gap-3">
        <Avatar person={m} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-zinc-900 group-hover:text-brand-700 dark:text-zinc-100 dark:group-hover:text-brand-300">{fullName(m)}</p>
          <p className="truncate text-xs text-zinc-500">{m.family?.name ?? "No household"}</p>
        </div>
        <StatusBadge status={m.status} />
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[13px]">
        <dt className="text-zinc-500">Groups</dt>
        <dd className="min-w-0"><Chips items={m.groups} empty="None yet" /></dd>
        <dt className="text-zinc-500">Teams</dt>
        <dd className="min-w-0"><Chips items={m.teams} empty="None yet" /></dd>
      </dl>
    </Link>
  );
}

export function PeoplePage() {
  const { data: members, isLoading, error } = useMembers();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState<View>(readView);
  const q = params.get("q") ?? "";
  const status = (MEMBER_STATUSES as readonly string[]).includes(params.get("status") ?? "") ? (params.get("status") as MemberStatus) : "all";

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem("people-view", v);
    } catch {
      /* ignore */
    }
  };
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const searched = useMemo(() => (members ?? []).filter((m) => matches(m, q.trim())), [members, q]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(MEMBER_STATUSES.map((s) => [s, 0])) as Record<MemberStatus, number>;
    for (const m of searched) c[m.status]++;
    return c;
  }, [searched]);
  const visible = searched.filter((m) => (status === "all" ? m.status !== "archived" : m.status === status));

  if (isLoading) return <LoadingPage />;
  if (error) return <ErrorNotice error={error} />;

  const tabs: { value: StatusFilter; label: string; count: number }[] = [
    { value: "all", label: "Everyone", count: searched.length - counts.archived },
    ...MEMBER_STATUSES.map((s) => ({ value: s, label: MEMBER_STATUS_LABELS[s], count: counts[s] })),
  ];

  return (
    <>
      <PageHeader
        title="People"
        description={`${pluralize((members ?? []).filter((m) => m.status !== "archived").length, "person", "people")} in the church directory`}
        actions={
          <ButtonLink to="/people/new" variant="primary" icon={<UserPlus className="size-4" />}>
            Add person
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input
            type="search"
            placeholder="Search name, email, phone…"
            aria-label="Search people"
            className="pl-8"
            value={q}
            onChange={(e) => setParam("q", e.target.value)}
          />
        </div>
        <Segmented label="Filter by status" value={status} onChange={(v) => setParam("status", v)} options={tabs} />
        <div className="lg:ml-auto">
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "table", label: <><Table2 className="size-3.5" aria-hidden />Table</> },
              { value: "cards", label: <><LayoutGrid className="size-3.5" aria-hidden />Cards</> },
            ]}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title={q ? `No one matches “${q}”` : "No one here yet"}
            description={q ? "Try a different spelling, or clear the status filter." : "Add the first person to get started."}
            action={!q ? <ButtonLink to="/people/new" variant="primary">Add person</ButtonLink> : undefined}
          />
        </Card>
      ) : (
        <div className={clsx(view === "cards" && "grid gap-3 sm:grid-cols-2 xl:grid-cols-3")}>
          {view === "table" && <PeopleTable people={visible} />}
          {view === "cards" && visible.map((m) => <PersonCard key={m.id} m={m} />)}
        </div>
      )}
    </>
  );
}
