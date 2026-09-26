import clsx from "clsx";
import { Baby, CircleAlert, LogOut, Phone, Search, Tablet, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { RosterEntry } from "@shared/schemas";
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  ErrorNotice,
  Field,
  IconButton,
  Input,
  LoadingPage,
  Modal,
  PageHeader,
  Segmented,
  useConfirm,
  useToast,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { ageLabel, formatDay, formatTime } from "../lib/format";
import { useCheckout, useDeleteKiosk, useKiosks, useMe, useRoster, useUndoCheckout } from "../lib/queries";

type Filter = "here" | "picked-up" | "all";

function matches(e: RosterEntry, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    e.securityCode.toLowerCase() === needle ||
    `${e.child.firstName} ${e.child.lastName}`.toLowerCase().includes(needle) ||
    (e.household?.name.toLowerCase().includes(needle) ?? false) ||
    e.contacts.some((c) => c.name.toLowerCase().includes(needle))
  );
}

/** Confirms the pickup code, and offers to release siblings on the same code together. */
function CheckoutDialog({ entry, roster, onClose }: { entry: RosterEntry; roster: RosterEntry[]; onClose: () => void }) {
  const siblings = roster.filter((e) => e.securityCode === entry.securityCode && !e.checkedOutAt);
  const [selected, setSelected] = useState<number[]>([entry.id]);
  const checkout = useCheckout();
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title={`Check out ${entry.child.firstName}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={checkout.isPending}
            disabled={selected.length === 0}
            onClick={() =>
              checkout.mutate(selected, {
                onSuccess: ({ checkedOut }) => {
                  toast(checkedOut === 1 ? `${entry.child.firstName} checked out` : `${checkedOut} kids checked out`);
                  onClose();
                },
                onError: (e) => toast(errorMessage(e), "error"),
              })
            }
          >
            Check out {selected.length > 1 ? `${selected.length} kids` : ""}
          </Button>
        </>
      }
    >
      <div className="rounded-xl bg-amber-50 p-4 text-center dark:bg-amber-500/10">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Make sure the parent's pickup tag says</p>
        <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-amber-950 dark:text-amber-100">{entry.securityCode}</p>
      </div>
      {siblings.length > 1 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Picking up together:</p>
          {siblings.map((s) => (
            <Checkbox
              key={s.id}
              label={`${s.child.firstName} ${s.child.lastName}`}
              checked={selected.includes(s.id)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function KioskSetup() {
  const { data: kiosks = [] } = useKiosks(true);
  const del = useDeleteKiosk();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("Lobby iPad");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Card className="mt-8">
      <CardHeader
        title="Check-in kiosks"
        description="Open this page on the iPad you'll use for check-in, then turn it into a kiosk."
        action={
          <Button size="sm" icon={<Tablet className="size-4" />} onClick={() => setOpen(true)}>
            Turn this device into a kiosk
          </Button>
        }
      />
      {kiosks.length === 0 ? (
        <p className="px-5 py-4 text-sm text-zinc-500">No kiosks set up yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {kiosks.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-5 py-3">
              <Tablet className="size-5 text-zinc-400" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{k.label ?? "Kiosk"}</p>
                <p className="truncate text-xs text-zinc-500">
                  Set up by {k.setUpBy} on {formatDay(k.createdAt.slice(0, 10))} · last used {formatDay(k.lastUsedAt.slice(0, 10))}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (await confirm({ title: `Turn off ${k.label ?? "this kiosk"}?`, message: "It will stop working right away. You can set it up again any time.", confirmLabel: "Turn off" })) {
                    del.mutate(k.id, { onSuccess: () => toast("Kiosk turned off"), onError: (e) => toast(errorMessage(e), "error") });
                  }
                }}
              >
                Turn off
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Turn this device into a kiosk?"
        description="You'll be signed out here, and this device will only be able to check kids in. To leave kiosk mode, tap “Staff” on the welcome screen."
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await api.post("/checkin/kiosks", { label });
                  window.location.assign("/kiosk");
                } catch (e) {
                  setError(errorMessage(e));
                  setPending(false);
                }
              }}
            >
              Start kiosk
            </Button>
          </>
        }
      >
        <Field label="Name this kiosk" htmlFor="kiosk-label" hint="Shows in the check-in history, e.g. “Lobby iPad”.">
          <Input id="kiosk-label" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
        {error && <div className="mt-3"><ErrorNotice error={new Error(error)} /></div>}
      </Modal>
    </Card>
  );
}

export function CheckinPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? undefined;
  const { data, isLoading, error, isFetching } = useRoster(date);
  const { data: me } = useMe();
  const undo = useUndoCheckout();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("here");
  const [q, setQ] = useState("");
  const [checkingOut, setCheckingOut] = useState<RosterEntry | null>(null);

  const entries = data?.entries ?? [];
  const here = entries.filter((e) => !e.checkedOutAt);
  const visible = useMemo(
    () =>
      entries
        .filter((e) => (filter === "here" ? !e.checkedOutAt : filter === "picked-up" ? !!e.checkedOutAt : true))
        .filter((e) => matches(e, q.trim())),
    [entries, filter, q],
  );

  if (isLoading) return <LoadingPage />;
  if (error || !data) return <ErrorNotice error={error} />;

  const isToday = data.serviceDate === data.today;
  const withNeeds = here.filter((e) => e.child.medicalNotes).length;

  return (
    <>
      <PageHeader
        title="Kids check-in"
        description={
          <span className="flex items-center gap-2">
            {formatDay(data.serviceDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {isToday && <span className={clsx("inline-block size-2 rounded-full bg-emerald-500", isFetching && "animate-pulse")} title="Updates automatically" />}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="Show a different day"
              value={data.serviceDate}
              max={data.today}
              onChange={(e) => setParams(e.target.value && e.target.value !== data.today ? { date: e.target.value } : {}, { replace: true })}
              className="w-40"
            />
            {!isToday && <Button onClick={() => setParams({}, { replace: true })}>Today</Button>}
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Here now", value: here.length },
          { label: "Picked up", value: entries.length - here.length },
          { label: "Allergies / needs", value: withNeeds, alert: withNeeds > 0 },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[13px] font-medium text-zinc-500">{s.label}</p>
            <p className={clsx("mt-1.5 text-3xl font-semibold tabular-nums", s.alert && "text-red-600 dark:text-red-400")}>{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input type="search" placeholder="Name, family, or pickup code" aria-label="Search checked-in kids" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "here", label: "Here now", count: here.length },
            { value: "picked-up", label: "Picked up", count: entries.length - here.length },
            { value: "all", label: "Everyone", count: entries.length },
          ]}
        />
      </div>

      <Card className="overflow-hidden">
        {visible.length === 0 ? (
          <EmptyState
            icon={<Baby className="size-5" />}
            title={
              entries.length === 0
                ? isToday
                  ? "No kids checked in yet"
                  : "No check-ins that day"
                : q.trim()
                  ? "No one matches"
                  : filter === "here"
                    ? "Everyone's been picked up"
                    : "No one has been picked up yet"
            }
            description={entries.length === 0 && isToday ? "Kids appear here as families check in at the kiosk. This page updates on its own." : undefined}
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {visible.map((e) => {
              const age = ageLabel(e.child.birthdate);
              return (
                <li key={e.id} className={clsx("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap", e.checkedOutAt && "bg-zinc-50/60 dark:bg-zinc-900/40")}>
                  <Avatar person={{ id: e.child.id, firstName: e.child.firstName, lastName: e.child.lastName }} />
                  <div className="min-w-0 flex-1">
                    <p className={clsx("font-medium", e.checkedOutAt && "text-zinc-500")}>
                      {e.child.firstName} {e.child.lastName}
                      {age && <span className="ml-2 text-sm font-normal text-zinc-500">{age}</span>}
                    </p>
                    {e.child.medicalNotes && (
                      <p className="mt-0.5 flex items-start gap-1 text-sm font-medium text-red-700 dark:text-red-400">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {e.child.medicalNotes}
                      </p>
                    )}
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-zinc-500">
                      {e.contacts.map((c) => (
                        <span key={c.name} className="inline-flex items-center gap-1">
                          {c.name}
                          {c.phone && (
                            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline dark:text-brand-300">
                              <Phone className="size-3" aria-hidden /> {c.phone}
                            </a>
                          )}
                        </span>
                      ))}
                      {e.contacts.length === 0 && e.household && <span>{e.household.name}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold tracking-widest">{e.securityCode}</p>
                    <p className="text-xs text-zinc-500">
                      {e.checkedOutAt ? `Picked up ${formatTime(e.checkedOutAt)}` : `In at ${formatTime(e.checkedInAt)}`}
                    </p>
                  </div>
                  <div className="w-28 text-right">
                    {e.checkedOutAt ? (
                      <IconButton
                        label={`Undo checkout for ${e.child.firstName}`}
                        onClick={() => undo.mutate(e.id, { onSuccess: () => toast(`${e.child.firstName} is back on the roster`), onError: (err) => toast(errorMessage(err), "error") })}
                      >
                        <Undo2 className="size-4" />
                      </IconButton>
                    ) : (
                      <Button size="sm" icon={<LogOut className="size-4" />} onClick={() => setCheckingOut(e)}>
                        Check out
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {checkingOut && <CheckoutDialog entry={checkingOut} roster={entries} onClose={() => setCheckingOut(null)} />}
      {me && me.role !== "volunteer" && <KioskSetup />}
    </>
  );
}
