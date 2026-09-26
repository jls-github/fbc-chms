import { ChartColumn, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ATTENDANCE_EVENT_LABELS, ATTENDANCE_EVENT_TYPES, type AttendanceEventType } from "@shared/constants";
import type { AttendanceReport } from "@shared/schemas";
import { TrendChart } from "../components/trend-chart";
import {
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
import { formatDay, todayIso } from "../lib/format";
import { useAttendance, useDeleteAttendance, useSaveAttendance } from "../lib/queries";

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
  const recent = reports.slice(0, 4);
  const avg4 = recent.length ? Math.round(recent.reduce((s, r) => s + r.attendance, 0) / recent.length) : null;
  const high = reports.reduce<AttendanceReport | null>((best, r) => (!best || r.attendance > best.attendance ? r : best), null);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Headcounts for services and gatherings"
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({})}>Record attendance</Button>}
      />

      <div className="mb-4">
        <Segmented
          label="Gathering"
          value={eventType}
          onChange={(t) => setParams(t === "sunday_service" ? {} : { type: t }, { replace: true })}
          options={ATTENDANCE_EVENT_TYPES.map((t) => ({ value: t, label: ATTENDANCE_EVENT_LABELS[t], count: counts[t] }))}
        />
      </div>

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
              { label: "Last 4 average", value: avg4 ?? "—", hint: `${recent.length} reports` },
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
              <CardHeader title={`${ATTENDANCE_EVENT_LABELS[eventType]} over time`} description={`${chronological.length} reports`} />
              <div className="px-3 py-4 sm:px-5">
                <TrendChart points={chronological.map((r) => ({ date: r.date, value: r.attendance }))} label={`${ATTENDANCE_EVENT_LABELS[eventType]} attendance`} />
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
                    <td className="hidden max-w-xs truncate px-4 py-2 text-zinc-500 sm:table-cell">{r.notes}</td>
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
