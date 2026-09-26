import { Cake, ChartColumn, HandHeart, UserPlus, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { PersonRef } from "@shared/schemas";
import { TrendChart } from "../components/trend-chart";
import { ButtonLink, Card, CardHeader, EmptyState, ErrorNotice, LoadingPage, PageHeader, PersonLink, Segmented, StatusBadge } from "../components/ui";
import { age, formatDay, relativeDays } from "../lib/format";
import { useDashboard, useMe } from "../lib/queries";
import { TREND_OPTIONS, useTrendMode, windowNote } from "../lib/trend-mode";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Stat({ label, value, to, hint }: { label: string; value: ReactNode; to?: string; hint?: ReactNode }) {
  const body = (
    <>
      <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-zinc-900 tabular-nums dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </>
  );
  const cls =
    "block rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 transition-colors";
  return to ? (
    <Link to={to} className={`${cls} hover:border-brand-300 dark:hover:border-brand-700`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function PeopleCard({ title, description, people, empty, icon }: { title: string; description: string; people: PersonRef[]; empty: string; icon: ReactNode }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {title}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 tabular-nums dark:bg-zinc-800 dark:text-zinc-400">
              {people.length}
            </span>
          </span>
        }
        description={description}
      />
      {people.length === 0 ? (
        <EmptyState icon={icon} title={empty} />
      ) : (
        <ul className="max-h-72 overflow-y-auto px-5 py-3">
          {people.map((p) => (
            <li key={p.id}>
              <PersonLink person={p} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { data: me } = useMe();
  const [trendMode, setTrendMode] = useTrendMode();

  if (isLoading) return <LoadingPage />;
  if (error || !data) return <ErrorNotice error={error} />;

  const { counts } = data;
  const trend = data.sundayTrend.map((p) =>
    trendMode === "rolling"
      ? { date: p.date, value: p.rollingAverage, note: windowNote(p.windowCount, "Sunday") }
      : { date: p.date, value: p.attendance },
  );

  return (
    <>
      <PageHeader
        title={`${greeting()}${me?.name ? `, ${me.name.split(" ")[0]}` : ""}`}
        description={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        actions={
          <>
            <ButtonLink to="/attendance?new=1" icon={<ChartColumn className="size-4" />}>
              Record attendance
            </ButtonLink>
            <ButtonLink to="/people/new" variant="primary" icon={<UserPlus className="size-4" />}>
              Add person
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active members" value={counts.active} to="/people?status=active" hint={`${counts.total} people in the directory`} />
        <Stat label="Prospective" value={counts.prospective} to="/people?status=prospective" />
        <Stat label="Guests" value={counts.guest} to="/people?status=guest" hint="Ready for follow-up" />
        <Stat
          label="Avg. Sunday attendance"
          value={data.averageSundayAttendance ?? "—"}
          to="/attendance"
          hint={data.averageSundayAttendance === null ? "No reports this quarter" : "Last 3 months"}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Households" value={counts.households} to="/households" />
        <Stat label="In a group" value={counts.inGroups} to="/groups" />
        <Stat label="Serving on a team" value={counts.onTeams} to="/teams" />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Sunday attendance"
          description={trendMode === "rolling" ? "Last six months · 4-week rolling average" : "Last six months"}
          action={
            trend.length > 0 && <Segmented label="Show" value={trendMode} onChange={setTrendMode} options={TREND_OPTIONS} />
          }
        />
        <div className="px-3 py-4 sm:px-5">
          {trend.length ? (
            <>
              <TrendChart points={trend} label={trendMode === "rolling" ? "Sunday attendance, 4-week rolling average" : "Sunday attendance"} />
              <Link to="/attendance" className="mt-2 inline-block px-2 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                View all attendance →
              </Link>
            </>
          ) : (
            <EmptyState
              icon={<ChartColumn className="size-5" />}
              title="No Sunday attendance recorded yet"
              action={<ButtonLink to="/attendance?new=1">Record attendance</ButtonLink>}
            />
          )}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <PeopleCard
          title="Not in a group"
          description="Active adults who aren't in a community group yet"
          people={data.adultsWithoutGroup}
          empty="Every active adult is in a group"
          icon={<UsersRound className="size-5" />}
        />
        <PeopleCard
          title="Not serving"
          description="Active adults who aren't on a ministry team"
          people={data.adultsWithoutTeam}
          empty="Every active adult is serving"
          icon={<HandHeart className="size-5" />}
        />
        <Card>
          <CardHeader title="Newest guests" description="Most recently added — worth a follow-up" />
          {data.recentGuests.length === 0 ? (
            <EmptyState icon={<UserPlus className="size-5" />} title="No guests right now" />
          ) : (
            <ul className="px-5 py-3">
              {data.recentGuests.map((p) => (
                <li key={p.id}>
                  <PersonLink person={p} meta={`Added ${formatDay(p.createdAt.slice(0, 10))}`} suffix={<StatusBadge status={p.status} />} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Upcoming birthdays" description="Next 30 days" />
          {data.upcomingBirthdays.length === 0 ? (
            <EmptyState icon={<Cake className="size-5" />} title="No birthdays in the next 30 days" />
          ) : (
            <ul className="px-5 py-3">
              {data.upcomingBirthdays.map((p) => {
                const turning = (age(p.birthdate, new Date(`${p.nextBirthday}T12:00:00`)) ?? 0);
                return (
                  <li key={p.id}>
                    <PersonLink
                      person={p}
                      meta={`${formatDay(p.nextBirthday, { month: "long", day: "numeric" })} · turning ${turning}`}
                      suffix={<span className="text-xs font-medium text-zinc-500">{relativeDays(p.nextBirthday)}</span>}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
