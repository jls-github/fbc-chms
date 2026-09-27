import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { UsageReport } from "@shared/schemas";
import { TrendChart } from "../components/trend-chart";
import { Card, CardHeader, ErrorNotice, LoadingPage, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { formatShortDay } from "../lib/format";

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[13px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </li>
  );
}

/** Small groups are hidden so a number can't point to one person. */
const masked = (n: number | null) => (n === null ? <span className="text-sm font-normal text-zinc-500">fewer than 3</span> : n);

export function UsagePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["usage"],
    queryFn: () => api.get<UsageReport>("/usage"),
    staleTime: 60_000,
  });
  if (isLoading) return <LoadingPage />;
  if (error || !data) return <ErrorNotice error={error} />;

  const { active, last30Days: d } = data;
  const weekly = data.weeklyApp.map((w, i, all) => ({
    date: w.weekStart,
    value: w.count,
    dateLabel: `Week of ${formatShortDay(w.weekStart)}${i === all.length - 1 ? " (so far)" : ""}`,
  }));

  return (
    <>
      <PageHeader title="Usage" description="How the member app and staff site are being used. Anonymous totals only — no one's activity is tracked." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Using the app today" value={active.app.today} />
        <Stat label="This week" value={active.app.week} hint="Different people, Sunday–Saturday" />
        <Stat label="This month" value={active.app.month} />
        <Stat label="Staff site this week" value={active.staff.week} hint={`${active.staff.today} today`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Weekly app users" description="Different people who opened the member app each week" />
          <div className="px-3 py-4 sm:px-5">
            {weekly.some((w) => w.value > 0) ? (
              <TrendChart points={weekly} label="Weekly member app users" />
            ) : (
              <p className="py-10 text-center text-sm text-zinc-500">No app use recorded yet.</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Devices this month" description="Counts under 3 are hidden for privacy" />
          <ul className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
            <Row label="iPhone & iPad" value={masked(data.platformsThisMonth.ios)} />
            <Row label="Android" value={masked(data.platformsThisMonth.android)} />
            <Row label="Web browser" value={masked(data.platformsThisMonth.web)} />
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Last 30 days" />
          <ul className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
            <Row label="Directory views" value={d.directoryViews} />
            <Row label="Sermons opened" value={d.sermonOpens} />
            <Row label="Chats opened" value={d.chatsOpened} />
            <Row label="Messages sent" value={d.messagesSent} />
            <Row label="Kids checked in" value={d.kidsCheckedIn} />
            <Row label="Leader attendance reports" value={d.leaderReports} />
            <Row label="New app sign-ups" value={d.signUps} />
          </ul>
        </Card>
        <Card>
          <CardHeader title="Most-opened sermons" description="Last 30 days" />
          {data.topSermons.length ? (
            <ol className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
              {data.topSermons.map((s) => (
                <Row key={s.id} label={s.title ?? `Sermon ${s.id}`} value={s.opens} />
              ))}
            </ol>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-zinc-500">No sermons opened yet.</p>
          )}
        </Card>
        <Card>
          <CardHeader title="App accounts" />
          <ul className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
            <Row label="Active" value={data.accounts.active} />
            <Row label="Waiting for review" value={data.accounts.pending} />
            <Row label="Invited, not yet set up" value={data.accounts.invited} />
            <Row label="Opted out of statistics" value={data.accounts.optedOut} />
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand-600 dark:text-brand-300" aria-hidden /> How these numbers protect privacy
            </span>
          }
        />
        <ul className="list-disc space-y-1.5 px-9 py-4 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Only totals are kept — never a list of who did what, what anyone looked at, or when a particular person was active.</li>
          <li>
            To count each person once per day, week and month, the server briefly keeps a scrambled code made with a key that exists only for that period. When the
            period ends, only the total is kept and the codes and key are deleted, so it can't be traced back to anyone — even by us.
          </li>
          <li>No cookies, device fingerprinting, IP addresses or outside analytics services. Everything stays on the church's own server.</li>
          <li>
            Anyone can switch off “Share anonymous usage statistics” (Profile in the app, Settings here), which also removes their current activity. Browsers sending
            Global Privacy Control or Do Not Track are left out automatically.
          </li>
          <li>Breakdowns of fewer than 3 people are hidden, and all statistics are deleted after 25 months.</li>
        </ul>
      </Card>
    </>
  );
}
