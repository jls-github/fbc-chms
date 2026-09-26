import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Church, LinkIcon } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { Button, ErrorNotice, Field, Input, Textarea } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useForm } from "../lib/form";
import { formatDay, todayIso } from "../lib/format";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-zinc-50 px-4 py-8 sm:py-14 dark:from-zinc-900 dark:to-zinc-950">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Church className="size-[18px]" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">FBC Enumclaw</span>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">{children}</div>
      </div>
    </div>
  );
}

/** Public, no-login attendance form that group leaders reach through a shared link. */
export function LeaderReportPage() {
  const token = useParams().token ?? "";
  const link = useQuery({
    queryKey: ["public-report", token],
    queryFn: () => api.get<{ eventType: string; label: string }>(`/public/reports/${encodeURIComponent(token)}`),
    retry: false,
    staleTime: Infinity,
  });
  const form = useForm({ date: todayIso(), attendance: "", notes: "", website: "" });
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<{ date: string; attendance: string } | null>(null);

  if (link.isLoading) return <Shell><div className="h-64 animate-pulse" aria-busy="true" /></Shell>;

  if (link.error || !link.data) {
    const gone = link.error instanceof ApiError && link.error.status === 404;
    return (
      <Shell>
        <div className="py-6 text-center">
          <LinkIcon className="mx-auto mb-3 size-8 text-zinc-400" aria-hidden />
          <h1 className="font-semibold">{gone ? "This link isn't active" : "Something went wrong"}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {gone ? "It may have been replaced. Ask the church office for the current link." : "Please try again in a moment."}
          </p>
        </div>
      </Shell>
    );
  }

  if (submitted) {
    return (
      <Shell>
        <div className="py-4 text-center">
          <CircleCheck className="mx-auto mb-3 size-10 text-emerald-500" aria-hidden />
          <h1 className="text-lg font-semibold">Thanks! Report received.</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {submitted.attendance} {Number(submitted.attendance) === 1 ? "person" : "people"} on {formatDay(submitted.date, { weekday: "long", month: "long", day: "numeric" })}.
          </p>
          <Button
            className="mt-6"
            onClick={() => {
              form.setValues({ date: todayIso(), attendance: "", notes: "", website: "" });
              setSubmitted(null);
            }}
          >
            Submit another report
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold">{link.data.label} attendance</h1>
      <p className="mt-1 text-sm text-zinc-500">Thanks for leading! This takes about 30 seconds.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const ok = await form.handle(() => api.post(`/public/reports/${encodeURIComponent(token)}`, form.values));
          setPending(false);
          if (ok) setSubmitted({ date: form.values.date, attendance: form.values.attendance });
        }}
      >
        {form.formError && !Object.keys(form.errors).length && <ErrorNotice error={new Error(form.formError)} />}
        <Field label="Date you met" htmlFor="date" error={form.errors.date}>
          <Input type="date" required max={todayIso()} {...form.bind("date")} />
        </Field>
        <Field label="How many people came?" htmlFor="attendance" error={form.errors.attendance} hint="Count everyone, including yourself.">
          <Input type="number" inputMode="numeric" min={0} max={1000} required autoFocus className="h-11 text-lg" {...form.bind("attendance")} />
        </Field>
        <Field label="Notes" htmlFor="notes" error={form.errors.notes} hint="Optional — your group's name, prayer requests, anything the staff should know.">
          <Textarea rows={3} {...form.bind("notes")} />
        </Field>
        {/* Bot trap: invisible to people, tempting to form-filling bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" value={form.values.website} onChange={(e) => form.set("website", e.target.value)} />
        </div>
        <Button type="submit" variant="primary" className="h-11 w-full text-base" loading={pending}>
          Submit report
        </Button>
      </form>
    </Shell>
  );
}
