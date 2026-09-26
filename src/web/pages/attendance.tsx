import { ChartColumn, Copy, LinkIcon, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ATTENDANCE_EVENT_LABELS, ATTENDANCE_EVENT_TYPES, LINK_REPORT_EVENT_TYPES, type AttendanceEventType, type LinkReportEventType } from "@shared/constants";
import type { AttendanceReport } from "@shared/schemas";
import { TrendChart } from "../components/trend-chart";
import {
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
  Segmented,
  Select,
  Textarea,
  useConfirm,
  useToast,
} from "../components/ui";
import { errorMessage } from "../lib/api";
import { useForm } from "../lib/form";
import { formatDay, formatShortDay, todayIso } from "../lib/format";
import { useAttendance, useDeleteAttendance, useMe, useReportLinks, useRotateReportLink, useSaveAttendance } from "../lib/queries";
import { TREND_OPTIONS, useTrendMode, windowNote } from "../lib/trend-mode";
import { withRollingAverage } from "@shared/rolling";

/** The shareable no-login form link for leaders of this gathering type. */
function LeaderLinkCard({ eventType }: { eventType: LinkReportEventType }) {
  const { data: links } = useReportLinks();
  const { data: me } = useMe();
  const rotate = useRotateReportLink();
  const confirm = useConfirm();
  const toast = useToast();
  const link = links?.find((l) => l.eventType === eventType);
  if (!link) return null;
  const url = `${window.location.origin}${link.path}`;

  return (
    <Card className="mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <LinkIcon className="size-4 text-zinc-400" aria-hidden /> Leader report link
        </p>
        <p className="mt-0.5 text-[13px] text-zinc-500">
          Send this to {ATTENDANCE_EVENT_LABELS[eventType].toLowerCase()} leaders — they can report attendance without signing in.
        </p>
        <code className="mt-2 block truncate rounded-md bg-zinc-100 px-2 py-1 text-[12px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">{url}</code>
      </div>
      <div className="flex shrink-0 gap-2">
        {me?.role === "admin" && (
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="size-4" />}
            loading={rotate.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: "Replace this link?",
                  message: "The current link will stop working right away, and you'll need to send leaders the new one. Do this if the link was shared somewhere it shouldn't be.",
                  confirmLabel: "Replace link",
                })
              ) {
                rotate.mutate(eventType, { onSuccess: () => toast("New link created"), onError: (e) => toast(errorMessage(e), "error") });
              }
            }}
          >
            New link
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          icon={<Copy className="size-4" />}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast("Link copied");
            } catch {
              toast("Couldn't copy — select the link and copy it manually", "error");
            }
          }}
        >
          Copy link
        </Button>
      </div>
    </Card>
  );
}

/** The most recent Sunday (today, if it's Sunday) as YYYY-MM-DD. */
function lastSunday() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("en-CA");
}

function ReportDialog({
  report,
  defaultType,
  open,
  onClose,
}: {
  report?: AttendanceReport;
  defaultType: AttendanceEventType;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveAttendance(report?.id);
  const toast = useToast();
  const form = useForm({
    eventType: report?.eventType ?? defaultType,
    date: report?.date ?? (defaultType === "sunday_service" ? lastSunday() : todayIso()),
    attendance: report ? String(report.attendance) : "",
    notes: report?.notes ?? "",
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={report ? "Edit attendance" : "Record attendance"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="attendance-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        id="attendance-form"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await form.handle(async () => {
            await save.mutateAsync({ ...form.values, attendance: Number(form.values.attendance) });
            toast("Attendance saved");
            onClose();
          });
        }}
      >
        <Field label="Gathering" htmlFor="eventType" error={form.errors.eventType}>
          <Select id="eventType" value={form.values.eventType} onChange={(e) => form.set("eventType", e.target.value as AttendanceEventType)}>
            {ATTENDANCE_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{ATTENDANCE_EVENT_LABELS[t]}</option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="date" error={form.errors.date}>
            <Input type="date" required max={todayIso()} {...form.bind("date")} />
          </Field>
          <Field label="Headcount" htmlFor="attendance" error={form.errors.attendance}>
            <Input type="number" inputMode="numeric" min={0} required autoFocus {...form.bind("attendance")} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes" error={form.errors.notes} hint="Optional — e.g. “Easter”, “snow day”.">
          <Textarea rows={2} {...form.bind("notes")} />
        </Field>
      </form>
    </Modal>
  );
}

export function AttendancePage() {
  const [params, setParams] = useSearchParams();
  const typeParam = params.get("type") as AttendanceEventType | null;
  const eventType: AttendanceEventType = typeParam && ATTENDANCE_EVENT_TYPES.includes(typeParam) ? typeParam : "sunday_service";
  const { data: allReports, isLoading, error } = useAttendance();
  const del = useDeleteAttendance();
  const confirm = useConfirm();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ report?: AttendanceReport } | null>(null);
  const [trendMode, setTrendMode] = useTrendMode();

  useEffect(() => {
    if (params.get("new")) {
      setDialog({});
      const next = new URLSearchParams(params);
      next.delete("new");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  const reports = useMemo(() => (allReports ?? []).filter((r) => r.eventType === eventType), [allReports, eventType]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(ATTENDANCE_EVENT_TYPES.map((t) => [t, 0])) as Record<AttendanceEventType, number>;
    for (const r of allReports ?? []) c[r.eventType]++;
    return c;
  }, [allReports]);

  if (isLoading) return <LoadingPage />;
  if (error) return <ErrorNotice error={error} />;

  const chronological = [...reports].reverse();
  const rolling = withRollingAverage(chronological.map((r) => ({ date: r.date, value: r.attendance })));
  const latestRolling = rolling.at(-1);
  const chartPoints = rolling.map((p) =>
    trendMode === "rolling" ? { date: p.date, value: p.rollingAverage, note: windowNote(p.windowCount) } : { date: p.date, value: p.value },
  );
  const high = reports.reduce<AttendanceReport | null>((best, r) => (!best || r.attendance > best.attendance ? r : best), null);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Headcounts for services and gatherings"
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({})}>Record attendance</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Gathering"
          value={eventType}
          onChange={(t) => setParams(t === "sunday_service" ? {} : { type: t }, { replace: true })}
          options={ATTENDANCE_EVENT_TYPES.map((t) => ({ value: t, label: ATTENDANCE_EVENT_LABELS[t], count: counts[t] }))}
        />
        <Segmented label="Chart shows" value={trendMode} onChange={setTrendMode} options={TREND_OPTIONS} />
      </div>

      {LINK_REPORT_EVENT_TYPES.includes(eventType as LinkReportEventType) && <LeaderLinkCard eventType={eventType as LinkReportEventType} />}

      {reports.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ChartColumn className="size-5" />}
            title={`No ${ATTENDANCE_EVENT_LABELS[eventType]} attendance yet`}
            action={<Button variant="primary" onClick={() => setDialog({})}>Record the first one</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Most recent", value: reports[0]!.attendance, hint: formatDay(reports[0]!.date) },
              {
                label: "4-week average",
                value: latestRolling?.rollingAverage ?? "—",
                hint: latestRolling ? `${latestRolling.windowCount} ${latestRolling.windowCount === 1 ? "report" : "reports"} in the 4 weeks to ${formatShortDay(latestRolling.date)}` : "",
              },
              { label: "Highest", value: high?.attendance ?? "—", hint: high ? formatDay(high.date) : "" },
            ].map((s) => (
              <Card key={s.label} className="p-4">
                <p className="text-[13px] font-medium text-zinc-500">{s.label}</p>
                <p className="mt-1.5 text-2xl font-semibold tabular-nums sm:text-3xl">{s.value}</p>
                <p className="mt-1 truncate text-xs text-zinc-500">{s.hint}</p>
              </Card>
            ))}
          </div>

          {chronological.length > 1 && (
            <Card className="mt-6">
              <CardHeader
                title={`${ATTENDANCE_EVENT_LABELS[eventType]} over time`}
                description={trendMode === "rolling" ? `4-week rolling average · ${chronological.length} reports` : `${chronological.length} reports`}
              />
              <div className="px-3 py-4 sm:px-5">
                <TrendChart
                  points={chartPoints}
                  label={`${ATTENDANCE_EVENT_LABELS[eventType]} attendance${trendMode === "rolling" ? ", 4-week rolling average" : ""}`}
                />
              </div>
            </Card>
          )}

          <Card className="mt-6 overflow-hidden">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{ATTENDANCE_EVENT_LABELS[eventType]} attendance reports</caption>
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Headcount</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Notes</th>
                  <th scope="col" className="w-24 px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-2 whitespace-nowrap">{formatDay(r.date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{r.attendance}</td>
                    <td className="hidden max-w-xs truncate px-4 py-2 text-zinc-500 sm:table-cell">
                      {r.source === "leader_link" && <Badge className="mr-2">Leader</Badge>}
                      <span title={r.notes ?? undefined}>{r.notes}</span>
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      <IconButton label="Edit" onClick={() => setDialog({ report: r })}><Pencil className="size-4" /></IconButton>
                      <IconButton
                        label="Delete"
                        onClick={async () => {
                          if (await confirm({ title: "Delete this report?", message: `${ATTENDANCE_EVENT_LABELS[r.eventType]} on ${formatDay(r.date)} (${r.attendance}).` })) {
                            del.mutate(r.id, { onSuccess: () => toast("Report deleted"), onError: (e) => toast(errorMessage(e), "error") });
                          }
                        }}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {dialog && (
        <ReportDialog key={dialog.report?.id ?? "new"} report={dialog.report} defaultType={eventType} open onClose={() => setDialog(null)} />
      )}
    </>
  );
}
