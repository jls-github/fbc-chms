import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowLeft, Check, Church, CircleAlert, Plus, Printer, Search, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { KioskCheckinResult, KioskChildInput, KioskHousehold, KioskRegisterInput } from "@shared/schemas";
import { Button, ErrorNotice, Field, Input, Modal } from "../components/ui";
import { api, ApiError, errorMessage } from "../lib/api";
import { ageLabel, formatDay, todayIso } from "../lib/format";

type Step =
  | { name: "search" }
  | { name: "results"; query: string; households: KioskHousehold[] }
  | { name: "household"; household: KioskHousehold; selected: number[] }
  | { name: "register" }
  | { name: "add-child"; household: KioskHousehold; selected: number[] }
  | { name: "done"; result: KioskCheckinResult };

/** Go back to the welcome screen after this long without a touch, so the next family never sees the last one's details. */
const IDLE_MS = 90_000;
const DONE_MS = 30_000;

function KioskShell({ children, onBack, footer }: { children: ReactNode; onBack?: () => void; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-50 to-white text-zinc-900 select-none print:hidden dark:from-zinc-900 dark:to-zinc-950 dark:text-zinc-100">
      <header className="flex h-20 shrink-0 items-center justify-between px-6">
        {onBack ? (
          <button type="button" onClick={onBack} className="flex h-14 items-center gap-2 rounded-2xl px-4 text-lg font-medium text-zinc-600 active:bg-zinc-200/60 dark:text-zinc-300">
            <ArrowLeft className="size-6" aria-hidden /> Back
          </button>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <Church className="size-6" aria-hidden />
          </span>
          <span className="text-lg font-semibold">FBC Enumclaw Kids</span>
        </span>
        <span className="w-24" />
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-10">{children}</main>
      {footer}
    </div>
  );
}

const bigButton =
  "inline-flex h-16 items-center justify-center gap-2 rounded-2xl px-8 text-xl font-semibold transition active:scale-[0.98] disabled:opacity-50";

function KidAge({ kid }: { kid: { birthdate: string | null } }) {
  const age = ageLabel(kid.birthdate);
  return age ? <span className="text-zinc-500">{age}</span> : null;
}

function AllergyTag({ notes }: { notes: string | null }) {
  if (!notes) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-800 dark:bg-red-500/15 dark:text-red-300">
      <CircleAlert className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{notes}</span>
    </span>
  );
}

// ------------------------------------------------------------------ screens

function SearchScreen({ onResults, onRegister }: { onResults: (q: string, households: KioskHousehold[]) => void; onRegister: () => void }) {
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const search = useMutation({
    mutationFn: (query: string) => api.get<{ households: KioskHousehold[] }>(`/kiosk/households?q=${encodeURIComponent(query)}`),
  });
  const submit = async () => {
    setError(null);
    try {
      const { households } = await search.mutateAsync(q.trim());
      onResults(q.trim(), households);
    } catch (err) {
      setError(err instanceof ApiError && err.fieldErrors.q ? err.fieldErrors.q[0]! : errorMessage(err));
    }
  };
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Welcome! 👋</h1>
      <p className="mt-3 text-xl text-zinc-600 dark:text-zinc-400">Check your kids in with your phone number or last name.</p>
      <form
        className="mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void submit();
        }}
      >
        <label htmlFor="kiosk-search" className="sr-only">Phone number or last name</label>
        <input
          id="kiosk-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Phone number or last name"
          className="h-16 flex-1 rounded-2xl border-2 border-zinc-200 bg-white px-5 text-2xl shadow-sm outline-none placeholder:text-zinc-400 focus:border-brand-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" disabled={!q.trim() || search.isPending} className={clsx(bigButton, "bg-brand-600 text-white shadow-sm")}>
          <Search className="size-6" aria-hidden /> Find us
        </button>
      </form>
      {error && <p className="mt-4 text-lg font-medium text-red-600 dark:text-red-400" role="alert">{error}</p>}
      <div className="mt-16 flex flex-col items-center gap-3">
        <p className="text-lg text-zinc-500">First time here? We're so glad you came.</p>
        <button type="button" onClick={onRegister} className={clsx(bigButton, "border-2 border-brand-200 bg-white text-brand-700 dark:border-brand-800 dark:bg-zinc-900 dark:text-brand-300")}>
          <UserPlus className="size-6" aria-hidden /> Register my family
        </button>
      </div>
    </div>
  );
}

function ResultsScreen({ query, households, onPick, onRegister }: { query: string; households: KioskHousehold[]; onPick: (h: KioskHousehold) => void; onRegister: () => void }) {
  if (households.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-3xl font-bold">We couldn't find “{query}”</h1>
        <p className="mt-3 text-xl text-zinc-600 dark:text-zinc-400">Try the phone number you gave us, or register if this is your first visit.</p>
        <button type="button" onClick={onRegister} className={clsx(bigButton, "mt-10 bg-brand-600 text-white")}>
          <UserPlus className="size-6" aria-hidden /> Register my family
        </button>
      </div>
    );
  }
  return (
    <div className="pt-4">
      <h1 className="text-3xl font-bold">Which family are you?</h1>
      <ul className="mt-6 space-y-4">
        {households.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onPick(h)}
              className="w-full rounded-3xl border-2 border-zinc-200 bg-white p-6 text-left shadow-sm transition active:scale-[0.99] active:border-brand-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span className="block text-2xl font-semibold">{h.name}</span>
              <span className="mt-1 block text-lg text-zinc-500">
                {h.children.length ? `Kids: ${h.children.map((k) => k.firstName).join(", ")}` : "No kids added yet"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-center text-lg text-zinc-500">
        Not here?{" "}
        <button type="button" onClick={onRegister} className="font-semibold text-brand-700 underline dark:text-brand-300">
          Register your family
        </button>
      </p>
    </div>
  );
}

function HouseholdScreen({
  household,
  selected,
  onToggle,
  onAddChild,
  onDone,
}: {
  household: KioskHousehold;
  selected: number[];
  onToggle: (id: number) => void;
  onAddChild: () => void;
  onDone: (result: KioskCheckinResult) => void;
}) {
  const checkin = useMutation({
    mutationFn: () => api.post<KioskCheckinResult>("/kiosk/checkins", { householdId: household.id, childIds: selected }),
    onSuccess: onDone,
  });
  const available = household.children.filter((k) => !k.checkedIn);
  return (
    <div className="flex flex-1 flex-col pt-4">
      <h1 className="text-3xl font-bold">{household.name}</h1>
      <p className="mt-2 text-xl text-zinc-600 dark:text-zinc-400">Tap each child you're checking in today.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {household.children.map((kid) => {
          const on = selected.includes(kid.id);
          return (
            <li key={kid.id}>
              <button
                type="button"
                disabled={kid.checkedIn}
                aria-pressed={on}
                onClick={() => onToggle(kid.id)}
                className={clsx(
                  "flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition active:scale-[0.99]",
                  kid.checkedIn
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
                    : on
                      ? "border-brand-500 bg-brand-50 shadow-sm dark:bg-brand-500/15"
                      : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900",
                )}
              >
                <span
                  className={clsx(
                    "flex size-10 shrink-0 items-center justify-center rounded-full border-2",
                    kid.checkedIn ? "border-emerald-500 bg-emerald-500 text-white" : on ? "border-brand-600 bg-brand-600 text-white" : "border-zinc-300 dark:border-zinc-600",
                  )}
                >
                  {(on || kid.checkedIn) && <Check className="size-6" strokeWidth={3} aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2xl font-semibold">{kid.firstName}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-lg">
                    <KidAge kid={kid} />
                    {kid.checkedIn && <span className="font-medium text-emerald-700 dark:text-emerald-400">Already checked in · {kid.securityCode}</span>}
                  </span>
                  <span className="mt-1 block"><AllergyTag notes={kid.medicalNotes} /></span>
                </span>
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onAddChild}
            className="flex h-full min-h-24 w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-zinc-300 p-5 text-xl font-medium text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400"
          >
            <Plus className="size-6" aria-hidden /> Add a child
          </button>
        </li>
      </ul>
      {checkin.error && <div className="mt-6"><ErrorNotice error={checkin.error} /></div>}
      <div className="mt-auto pt-10">
        <button
          type="button"
          disabled={selected.length === 0 || checkin.isPending}
          onClick={() => checkin.mutate()}
          className={clsx(bigButton, "w-full bg-brand-600 text-white shadow-md")}
        >
          {checkin.isPending
            ? "Checking in…"
            : selected.length
              ? `Check in ${selected.length} ${selected.length === 1 ? "child" : "kids"}`
              : available.length
                ? "Tap a child above"
                : "Everyone's checked in!"}
        </button>
      </div>
    </div>
  );
}

const blankChild = (): KioskChildInput => ({ firstName: "", lastName: "", birthdate: "", medicalNotes: "" });

function ChildFields({
  child,
  index,
  errors,
  onChange,
  onRemove,
  showLastName = true,
}: {
  child: KioskChildInput;
  index: number;
  errors: Record<string, string>;
  onChange: (c: KioskChildInput) => void;
  onRemove?: () => void;
  showLastName?: boolean;
}) {
  const e = (f: string) => errors[`children.${index}.${f}`] ?? errors[f];
  return (
    <div className="rounded-3xl border-2 border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Child {index + 1}</h3>
        {onRemove && (
          <button type="button" onClick={onRemove} className="flex items-center gap-1 rounded-xl px-3 py-2 text-base text-zinc-500 active:bg-zinc-100">
            <Trash2 className="size-5" aria-hidden /> Remove
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" error={e("firstName")} htmlFor={`kid-${index}-first`}>
          <Input id={`kid-${index}-first`} className="h-12 text-lg" autoComplete="off" value={child.firstName} invalid={!!e("firstName")} onChange={(ev) => onChange({ ...child, firstName: ev.target.value })} />
        </Field>
        {showLastName && (
          <Field label="Last name" hint="If different from yours" error={e("lastName")} htmlFor={`kid-${index}-last`}>
            <Input id={`kid-${index}-last`} className="h-12 text-lg" autoComplete="off" value={child.lastName ?? ""} onChange={(ev) => onChange({ ...child, lastName: ev.target.value })} />
          </Field>
        )}
        <Field label="Birthday" error={e("birthdate")} htmlFor={`kid-${index}-bday`}>
          <Input id={`kid-${index}-bday`} type="date" max={todayIso()} className="h-12 text-lg" value={child.birthdate} invalid={!!e("birthdate")} onChange={(ev) => onChange({ ...child, birthdate: ev.target.value })} />
        </Field>
        <Field label="Allergies or medical needs" hint="Optional" error={e("medicalNotes")} htmlFor={`kid-${index}-med`} className={showLastName ? "sm:col-span-2" : ""}>
          <Input id={`kid-${index}-med`} className="h-12 text-lg" autoComplete="off" placeholder="e.g. peanut allergy" value={child.medicalNotes ?? ""} onChange={(ev) => onChange({ ...child, medicalNotes: ev.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function fieldErrors(err: unknown) {
  return err instanceof ApiError ? Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? "Invalid"])) : {};
}

function RegisterScreen({ onRegistered }: { onRegistered: (h: KioskHousehold) => void }) {
  const [parent, setParent] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [kids, setKids] = useState<KioskChildInput[]>([blankChild()]);
  const register = useMutation({
    mutationFn: (input: KioskRegisterInput) => api.post<{ household: KioskHousehold }>("/kiosk/households", input),
    onSuccess: (r) => onRegistered(r.household),
  });
  const errors = fieldErrors(register.error);
  const p = (f: string) => errors[`parent.${f}`];

  return (
    <form
      className="pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate({ parent, children: kids });
      }}
    >
      <h1 className="text-3xl font-bold">Welcome! Tell us about your family</h1>
      <p className="mt-2 text-xl text-zinc-600 dark:text-zinc-400">You'll only need to do this once. Next time, just type your phone number.</p>

      <section className="mt-6 rounded-3xl border-2 border-zinc-200 bg-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">Parent or guardian</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={p("firstName")} htmlFor="p-first">
            <Input id="p-first" className="h-12 text-lg" autoComplete="off" value={parent.firstName} invalid={!!p("firstName")} onChange={(e) => setParent({ ...parent, firstName: e.target.value })} />
          </Field>
          <Field label="Last name" error={p("lastName")} htmlFor="p-last">
            <Input id="p-last" className="h-12 text-lg" autoComplete="off" value={parent.lastName} invalid={!!p("lastName")} onChange={(e) => setParent({ ...parent, lastName: e.target.value })} />
          </Field>
          <Field label="Mobile phone" error={p("phone")} hint="So we can reach you during the service" htmlFor="p-phone">
            <Input id="p-phone" type="tel" inputMode="tel" className="h-12 text-lg" autoComplete="off" value={parent.phone} invalid={!!p("phone")} onChange={(e) => setParent({ ...parent, phone: e.target.value })} />
          </Field>
          <Field label="Email" hint="Optional" error={p("email")} htmlFor="p-email">
            <Input id="p-email" type="email" className="h-12 text-lg" autoComplete="off" value={parent.email} invalid={!!p("email")} onChange={(e) => setParent({ ...parent, email: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="mt-6 space-y-4">
        {kids.map((kid, i) => (
          <ChildFields
            key={i}
            index={i}
            child={kid}
            errors={errors}
            onChange={(c) => setKids(kids.map((k, j) => (j === i ? c : k)))}
            onRemove={kids.length > 1 ? () => setKids(kids.filter((_, j) => j !== i)) : undefined}
          />
        ))}
        {errors.children && <p className="text-lg text-red-600">{errors.children}</p>}
        <button type="button" onClick={() => setKids([...kids, blankChild()])} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 text-lg font-medium text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400">
          <Plus className="size-5" aria-hidden /> Add another child
        </button>
      </section>

      {register.error && !Object.keys(errors).length && <div className="mt-6"><ErrorNotice error={register.error} /></div>}
      {register.error && Object.keys(errors).length > 0 && <p className="mt-6 text-lg font-medium text-red-600" role="alert">Please fix the highlighted fields.</p>}
      <button type="submit" disabled={register.isPending} className={clsx(bigButton, "mt-8 w-full bg-brand-600 text-white shadow-md")}>
        {register.isPending ? "Saving…" : "Continue to check-in"}
      </button>
    </form>
  );
}

function AddChildScreen({ household, onAdded }: { household: KioskHousehold; onAdded: (h: KioskHousehold, newChildId: number | undefined) => void }) {
  const [child, setChild] = useState<KioskChildInput>(blankChild());
  const add = useMutation({
    mutationFn: () => api.post<{ household: KioskHousehold }>(`/kiosk/households/${household.id}/children`, child),
    onSuccess: (r) => {
      const known = new Set(household.children.map((k) => k.id));
      onAdded(r.household, r.household.children.find((k) => !known.has(k.id))?.id);
    },
  });
  return (
    <form
      className="pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h1 className="text-3xl font-bold">Add a child to {household.name}</h1>
      <div className="mt-6">
        <ChildFields index={0} child={child} errors={fieldErrors(add.error)} onChange={setChild} />
      </div>
      {add.error && !Object.keys(fieldErrors(add.error)).length && <div className="mt-6"><ErrorNotice error={add.error} /></div>}
      <button type="submit" disabled={add.isPending} className={clsx(bigButton, "mt-8 w-full bg-brand-600 text-white shadow-md")}>
        {add.isPending ? "Saving…" : "Add child"}
      </button>
    </form>
  );
}

function DoneScreen({ result, onFinish }: { result: KioskCheckinResult; onFinish: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-10" strokeWidth={3} aria-hidden />
      </span>
      <h1 className="mt-5 text-4xl font-bold">You're all checked in!</h1>
      <p className="mt-3 text-xl text-zinc-600 dark:text-zinc-400">{result.children.map((k) => k.firstName).join(", ")}</p>
      <div className="mt-8 rounded-3xl border-2 border-zinc-200 bg-white px-12 py-6 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-lg font-medium text-zinc-500">Your pickup code</p>
        <p className="mt-1 font-mono text-7xl font-bold tracking-[0.2em] text-brand-700 dark:text-brand-300" aria-label={`Pickup code ${result.securityCode.split("").join(" ")}`}>
          {result.securityCode}
        </p>
      </div>
      <p className="mt-4 max-w-md text-lg text-zinc-600 dark:text-zinc-400">Show this code (or your pickup tag) when you pick up your kids.</p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.print()} className={clsx(bigButton, "border-2 border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100")}>
          <Printer className="size-6" aria-hidden /> Print name tags
        </button>
        <button type="button" onClick={onFinish} className={clsx(bigButton, "bg-brand-600 text-white")}>
          Done
        </button>
      </div>
    </div>
  );
}

/** Name tags + the parent's pickup tag, one per label page. Only visible when printing. */
function PrintLabels({ result }: { result: KioskCheckinResult }) {
  const day = formatDay(result.serviceDate, { weekday: "short", month: "short", day: "numeric" });
  return (
    <div className="hidden print:block">
      <style>{`@page { size: 4in 2in; margin: 0; }`}</style>
      {result.children.map((kid) => (
        <section key={kid.id} className="kid-label">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[26pt] leading-none font-bold">{kid.firstName}</p>
              <p className="mt-1 text-[11pt]">{kid.lastName} · {ageLabel(kid.birthdate) ?? ""}</p>
            </div>
            <p className="font-mono text-[22pt] font-bold">{result.securityCode}</p>
          </div>
          {kid.medicalNotes && <p className="mt-2 border-2 border-black px-1 text-[11pt] font-bold">⚠ {kid.medicalNotes}</p>}
          <p className="mt-auto text-[9pt]">{day}</p>
        </section>
      ))}
      <section className="kid-label">
        <p className="text-[11pt] font-bold uppercase">Pickup tag · keep this</p>
        <p className="font-mono text-[34pt] leading-tight font-bold">{result.securityCode}</p>
        <p className="text-[11pt]">{result.children.map((k) => k.firstName).join(", ")}</p>
        <p className="mt-auto text-[9pt]">{result.householdName} · {day}</p>
      </section>
    </div>
  );
}

// -------------------------------------------------------------------- page

export function KioskPage() {
  const status = useQuery({
    queryKey: ["kiosk-status"],
    queryFn: () => api.get<{ label: string | null; serviceDate: string }>("/kiosk/status"),
    retry: false,
    refetchInterval: 5 * 60 * 1000,
  });
  const [step, setStep] = useState<Step>({ name: "search" });
  const [exitOpen, setExitOpen] = useState(false);
  const reset = useCallback(() => setStep({ name: "search" }), []);
  const last = useRef(Date.now());

  // Idle reset: any touch keeps the session alive; the "done" screen clears sooner.
  useEffect(() => {
    last.current = Date.now();
    const touch = () => (last.current = Date.now());
    window.addEventListener("pointerdown", touch);
    window.addEventListener("keydown", touch);
    const timer = setInterval(() => {
      const limit = step.name === "done" ? DONE_MS : IDLE_MS;
      if (step.name !== "search" && Date.now() - last.current > limit) reset();
    }, 1000);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
      clearInterval(timer);
    };
  }, [step, reset]);

  if (status.isLoading) return <KioskShell><div className="flex-1" aria-busy="true" /></KioskShell>;
  if (status.error) {
    return (
      <KioskShell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h1 className="text-3xl font-bold">This device isn't set up for check-in</h1>
          <p className="mt-3 max-w-lg text-xl text-zinc-600 dark:text-zinc-400">
            A staff member can sign in, open <strong>Kids check-in</strong>, and choose “Turn this device into a kiosk”.
          </p>
          <Link to="/login" className={clsx(bigButton, "mt-8 bg-brand-600 text-white")}>Staff sign-in</Link>
        </div>
      </KioskShell>
    );
  }

  const back =
    step.name === "search"
      ? undefined
      : step.name === "add-child"
        ? () => setStep({ name: "household", household: step.household, selected: step.selected })
        : reset;

  return (
    <>
      <KioskShell
        onBack={step.name === "done" ? undefined : back}
        footer={
          step.name === "search" && (
            <footer className="flex items-center justify-between px-6 pb-4 text-sm text-zinc-400">
              <span>{status.data?.label ?? "Check-in"} · {formatDay(status.data!.serviceDate, { weekday: "long", month: "long", day: "numeric" })}</span>
              <button type="button" onClick={() => setExitOpen(true)} className="rounded-lg px-3 py-2 active:bg-zinc-200/60">Staff</button>
            </footer>
          )
        }
      >
        {step.name === "search" && (
          <SearchScreen
            onRegister={() => setStep({ name: "register" })}
            onResults={(query, households) =>
              households.length === 1
                ? setStep({ name: "household", household: households[0]!, selected: households[0]!.children.filter((k) => !k.checkedIn).map((k) => k.id) })
                : setStep({ name: "results", query, households })
            }
          />
        )}
        {step.name === "results" && (
          <ResultsScreen
            query={step.query}
            households={step.households}
            onRegister={() => setStep({ name: "register" })}
            onPick={(h) => setStep({ name: "household", household: h, selected: h.children.filter((k) => !k.checkedIn).map((k) => k.id) })}
          />
        )}
        {step.name === "household" && (
          <HouseholdScreen
            household={step.household}
            selected={step.selected}
            onToggle={(id) =>
              setStep({ ...step, selected: step.selected.includes(id) ? step.selected.filter((x) => x !== id) : [...step.selected, id] })
            }
            onAddChild={() => setStep({ name: "add-child", household: step.household, selected: step.selected })}
            onDone={(result) => setStep({ name: "done", result })}
          />
        )}
        {step.name === "register" && (
          <RegisterScreen
            onRegistered={(h) => setStep({ name: "household", household: h, selected: h.children.map((k) => k.id) })}
          />
        )}
        {step.name === "add-child" && (
          <AddChildScreen
            household={step.household}
            onAdded={(h, newId) => setStep({ name: "household", household: h, selected: newId ? [...step.selected, newId] : step.selected })}
          />
        )}
        {step.name === "done" && <DoneScreen result={step.result} onFinish={reset} />}
      </KioskShell>
      {step.name === "done" && <PrintLabels result={step.result} />}

      <Modal
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title="Leave kiosk mode?"
        description="This turns off check-in on this device. A staff member will need to sign in to set it up again."
        footer={
          <>
            <Button onClick={() => setExitOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api.post("/auth/logout").catch(() => undefined);
                window.location.assign("/login");
              }}
            >
              Leave kiosk mode
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Families won't be able to check in here until it's set up again.</p>
      </Modal>
    </>
  );
}
