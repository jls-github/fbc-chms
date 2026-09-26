import clsx from "clsx";
import { BookUser, Church, Mail, MapPin, Phone, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { MEMBER_STATUSES, MEMBER_STATUS_LABELS, type MemberStatus } from "@shared/constants";
import type { DirectoryEntry, DirectoryPerson } from "@shared/schemas";
import { FamilyPhotoEditor, FamilyPhotoView } from "../components/family-photo";
import { Button, Card, EmptyState, ErrorNotice, Input, LoadingPage, PageHeader } from "../components/ui";
import { pluralize } from "../lib/format";
import { useDirectory, useMe } from "../lib/queries";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const DEFAULT_STATUSES: MemberStatus[] = ["active", "prospective"];

/** "Mar 14" from "03-14". */
const birthday = (mmdd: string) => `${MONTHS[Number(mmdd.slice(0, 2)) - 1]} ${Number(mmdd.slice(3))}`;

/** "David & Rachel", or "Pat Brown & Chris Clark" when last names differ from the heading. */
function adultNames(e: DirectoryEntry) {
  const shared = e.adults.every((a) => a.lastName === e.adults[0]?.lastName);
  const names = e.adults.map((a) => (shared ? a.firstName : `${a.firstName} ${a.lastName}`));
  if (names.length <= 2) return names.join(" & ");
  return `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

/**
 * Each distinct number once. A number shared by everyone listed (a household
 * phone) gets no label; otherwise it's labelled with whose it is.
 */
function phonesFor(people: DirectoryPerson[]) {
  const byNumber = new Map<string, { phone: string; names: string[] }>();
  for (const p of people) {
    if (!p.phone) continue;
    const key = p.phone.replace(/\D/g, "") || p.phone;
    const entry = byNumber.get(key) ?? { phone: p.phone, names: [] };
    entry.names.push(p.firstName);
    byNumber.set(key, entry);
  }
  const withPhone = people.filter((p) => p.phone).length;
  return [...byNumber.values()].map((n) => ({
    phone: n.phone,
    label: people.length > 1 && !(n.names.length === withPhone && withPhone === people.length) ? n.names.join(" & ") : null,
  }));
}

const childName = (e: DirectoryEntry, c: DirectoryPerson) => (e.title.includes(c.lastName) ? c.firstName : `${c.firstName} ${c.lastName}`);

function useStatusParam(): [MemberStatus[], (s: MemberStatus[]) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("statuses");
  const statuses = raw ? (raw.split(",").filter((s) => (MEMBER_STATUSES as readonly string[]).includes(s)) as MemberStatus[]) : DEFAULT_STATUSES;
  return [
    statuses.length ? statuses : DEFAULT_STATUSES,
    (next) => {
      const p = new URLSearchParams(params);
      if (next.join(",") === DEFAULT_STATUSES.join(",")) p.delete("statuses");
      else p.set("statuses", next.join(","));
      setParams(p, { replace: true });
    },
  ];
}

function StatusPicker({ value, onChange }: { value: MemberStatus[]; onChange: (s: MemberStatus[]) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <legend className="sr-only">Who to include</legend>
      <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Include:</span>
      {MEMBER_STATUSES.filter((s) => s !== "archived").map((s) => (
        <label key={s} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded accent-brand-600"
            checked={value.includes(s)}
            onChange={(e) => {
              const next = e.target.checked ? [...value, s] : value.filter((x) => x !== s);
              if (next.length) onChange(MEMBER_STATUSES.filter((x) => next.includes(x)));
            }}
          />
          {MEMBER_STATUS_LABELS[s]}
        </label>
      ))}
    </fieldset>
  );
}

function entryMatches(e: DirectoryEntry, q: string) {
  if (!q) return true;
  const hay = [e.title, ...e.adults.flatMap((p) => [p.firstName, p.lastName, p.phone, p.email]), ...e.children.map((c) => c.firstName)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q.toLowerCase().split(/\s+/).every((part) => hay.includes(part));
}

// ------------------------------------------------------------ in-app page

function DirectoryCard({ entry }: { entry: DirectoryEntry }) {
  const contactPeople = entry.adults.length ? entry.adults : entry.children;
  return (
    <Card className="flex flex-col overflow-hidden sm:flex-row">
      {entry.householdId ? (
        <FamilyPhotoEditor compact familyId={entry.householdId} photoUrl={entry.photoUrl} title={entry.title} className="aspect-[4/3] w-full shrink-0 sm:aspect-auto sm:w-40" />
      ) : (
        <FamilyPhotoView photoUrl={null} title={entry.title} className="aspect-[4/3] w-full shrink-0 sm:aspect-auto sm:w-40" />
      )}
      <div className="min-w-0 flex-1 p-4 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">
            {entry.householdId ? (
              <Link to={`/households/${entry.householdId}`} className="hover:text-brand-700 dark:hover:text-brand-300">{entry.title}</Link>
            ) : (
              <Link to={`/people/${(entry.adults[0] ?? entry.children[0])!.id}`} className="hover:text-brand-700 dark:hover:text-brand-300">{entry.title}</Link>
            )}
          </h2>
        </div>
        {entry.adults.length > 0 && <p className="font-medium text-zinc-700 dark:text-zinc-300">{adultNames(entry)}</p>}
        {entry.children.length > 0 && (
          <p className="text-zinc-600 dark:text-zinc-400">
            {entry.adults.length ? "Children: " : ""}
            {entry.children.map((c) => `${childName(entry, c)}${c.birthday ? ` (${birthday(c.birthday)})` : ""}`).join(", ")}
          </p>
        )}
        <div className="mt-2 space-y-1 text-[13px] text-zinc-600 dark:text-zinc-400">
          {entry.address && (
            <p className="flex gap-1.5">
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
              <span>
                {entry.address.line1}
                {entry.address.line2 ? `, ${entry.address.line2}` : ""}
                {entry.address.city ? `, ${entry.address.city}` : ""}
                {entry.address.state ? ` ${entry.address.state}` : ""} {entry.address.postalCode ?? ""}
              </span>
            </p>
          )}
          {phonesFor(contactPeople).map(({ phone, label }) => (
            <p key={phone} className="flex items-center gap-1.5">
              <Phone className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
              <a href={`tel:${phone}`} className="hover:underline">{phone}</a>
              {label && <span className="text-zinc-400">{label}</span>}
            </p>
          ))}
          {contactPeople.filter((p) => p.email).map((p) => (
            <p key={`e${p.id}`} className="flex items-center gap-1.5 truncate">
              <Mail className="size-3.5 shrink-0 text-zinc-400" aria-hidden />
              <a href={`mailto:${p.email}`} className="truncate hover:underline">{p.email}</a>
            </p>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function DirectoryPage() {
  const [statuses, setStatuses] = useStatusParam();
  const { data, isLoading, error } = useDirectory(statuses);
  const [q, setQ] = useState("");
  const visible = useMemo(() => (data?.entries ?? []).filter((e) => entryMatches(e, q.trim())), [data, q]);

  if (isLoading) return <LoadingPage />;
  if (error || !data) return <ErrorNotice error={error} />;

  const withPhotos = data.entries.filter((e) => e.photoUrl).length;
  const households = data.entries.filter((e) => e.householdId).length;

  return (
    <>
      <PageHeader
        title="Directory"
        description={`${pluralize(data.entries.length, "listing")} · ${withPhotos} of ${households} households have a photo`}
        actions={
          <Button
            variant="primary"
            icon={<Printer className="size-4" />}
            onClick={() => window.open(`/directory/print?statuses=${statuses.join(",")}`, "_blank", "noopener")}
          >
            Print directory
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <Input type="search" placeholder="Search names, phones, emails…" aria-label="Search the directory" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <StatusPicker value={statuses} onChange={setStatuses} />
      </div>
      {data.optedOut > 0 && (
        <p className="mb-4 text-[13px] text-zinc-500">
          {pluralize(data.optedOut, "person has", "people have")} asked to be left out of the directory.
        </p>
      )}
      {visible.length === 0 ? (
        <Card>
          <EmptyState icon={<BookUser className="size-5" />} title={q ? `No one matches “${q}”` : "No one to list yet"} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((e) => (
            <DirectoryCard key={e.key} entry={e} />
          ))}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------- print page

function PrintEntry({ entry, photos }: { entry: DirectoryEntry; photos: boolean }) {
  const contactPeople = entry.adults.length ? entry.adults : entry.children;
  const adultBirthdays = entry.adults.filter((a) => a.birthday);
  return (
    <article className="flex gap-3">
      {photos && (
        <div className="h-[1.05in] w-[1.4in] shrink-0 overflow-hidden rounded border border-zinc-300">
          {entry.photoUrl ? (
            <img src={entry.photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-[8pt] text-zinc-400">No photo</div>
          )}
        </div>
      )}
      <div className="min-w-0 text-[9pt] leading-snug">
        <h3 className="text-[12pt] leading-tight font-bold">{entry.title}</h3>
        {entry.adults.length > 0 && <p className="font-semibold">{adultNames(entry)}</p>}
        {entry.children.length > 0 && (
          <p>
            {entry.adults.length ? <span className="text-zinc-600">Children: </span> : null}
            {entry.children.map((c) => `${childName(entry, c)}${c.birthday ? ` (${birthday(c.birthday)})` : ""}`).join(", ")}
          </p>
        )}
        {entry.address && (
          <p className="mt-1">
            {entry.address.line1}
            {entry.address.line2 ? `, ${entry.address.line2}` : ""}
            <br />
            {[entry.address.city, entry.address.state].filter(Boolean).join(", ")} {entry.address.postalCode ?? ""}
          </p>
        )}
        {phonesFor(contactPeople).map(({ phone, label }) => (
          <p key={phone}>
            {phone}
            {label && <span className="text-zinc-600"> ({label})</span>}
          </p>
        ))}
        {contactPeople.filter((p) => p.email).map((p) => (
          <p key={`e${p.id}`} className="break-all">{p.email}</p>
        ))}
        {adultBirthdays.length > 0 && (
          <p className="mt-1 text-zinc-700">
            <span className="text-zinc-600">Birthdays: </span>
            {adultBirthdays.map((a) => `${a.firstName} ${birthday(a.birthday!)}`).join(" · ")}
          </p>
        )}
      </div>
    </article>
  );
}

/** Waits for every photo on the page to finish loading so none print blank. */
async function printWhenReady() {
  await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
  window.print();
}

export function DirectoryPrintPage() {
  const { data: me, isLoading: meLoading } = useMe();
  const [statuses, setStatuses] = useStatusParam();
  const { data, isLoading, error } = useDirectory(statuses);
  const [photos, setPhotos] = useState(true);
  const [birthdays, setBirthdays] = useState(true);

  const groups = useMemo(() => {
    const byLetter = new Map<string, DirectoryEntry[]>();
    for (const e of data?.entries ?? []) {
      const letter = e.sortName[0]?.toUpperCase() ?? "#";
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), e]);
    }
    return [...byLetter.entries()];
  }, [data]);

  const birthdaysByMonth = useMemo(() => {
    const months: { day: number; name: string }[][] = Array.from({ length: 12 }, () => []);
    for (const e of data?.entries ?? []) {
      for (const p of [...e.adults, ...e.children]) {
        if (p.birthday) months[Number(p.birthday.slice(0, 2)) - 1]!.push({ day: Number(p.birthday.slice(3)), name: `${p.firstName} ${p.lastName}` });
      }
    }
    return months.map((m) => m.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name)));
  }, [data]);

  if (meLoading) return null;
  if (!me) return <Navigate to="/login" replace state={{ from: "/directory/print" }} />;
  if (isLoading) return <div className="p-10"><LoadingPage /></div>;
  if (error || !data) return <div className="p-10"><ErrorNotice error={error} /></div>;

  const people = data.entries.reduce((n, e) => n + e.adults.length + e.children.length, 0);
  const printed = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white dark:bg-zinc-950">
      {/* Letter pages for this document only (kiosk name tags use their own label size). */}
      <style>{`@page { size: letter; margin: 0.5in; }`}</style>

      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur print:hidden dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex max-w-[8.5in] flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/directory" className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">← Directory</Link>
            <StatusPicker value={statuses} onChange={setStatuses} />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-brand-600" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> Photos
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-brand-600" checked={birthdays} onChange={(e) => setBirthdays(e.target.checked)} /> Birthday calendar
            </label>
          </div>
          <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => void printWhenReady()}>
            Print or save as PDF
          </Button>
        </div>
      </div>

      {/* The document: shown as sheets on screen, flows into letter pages when printed. */}
      <div className="mx-auto my-6 max-w-[8.5in] bg-white text-black shadow-lg print:my-0 print:max-w-none print:shadow-none">
        <section className="directory-cover flex min-h-[10in] flex-col items-center justify-center p-[0.5in] text-center print:min-h-[9.9in] print:p-0">
          <span className="flex size-16 items-center justify-center rounded-2xl border-2 border-black">
            <Church className="size-9" aria-hidden />
          </span>
          <p className="mt-6 text-[14pt] tracking-[0.3em] uppercase">FBC Enumclaw</p>
          <h1 className="mt-2 text-[34pt] leading-tight font-bold">Church Directory</h1>
          <p className="mt-3 text-[13pt]">{printed}</p>
          <p className="mt-10 text-[10pt] text-zinc-600">
            {pluralize(data.entries.length, "listing")} · {pluralize(people, "person", "people")}
          </p>
          <p className="mt-auto max-w-[5in] text-[8pt] text-zinc-500">
            This directory is for members and friends of FBC Enumclaw. Please don't share it outside the church family.
          </p>
        </section>

        <div className="px-[0.5in] pb-[0.5in] print:p-0">
          {/* Two newspaper-style columns; each letter heading is kept with its first entry. */}
          <div className="columns-2 gap-x-[0.4in] pt-[0.3in] print:pt-0">
            {groups.map(([letter, entries]) =>
              entries.map((e, i) => (
                <div key={e.key} className="directory-entry mb-[0.2in] break-inside-avoid">
                  {i === 0 && (
                    <h2 className="mb-2 border-b-2 border-black pb-0.5 text-[15pt] leading-none font-bold">{letter}</h2>
                  )}
                  <PrintEntry entry={e} photos={photos} />
                </div>
              )),
            )}
          </div>

          {birthdays && (
            <section className="directory-birthdays mt-10">
              <h2 className="mb-4 border-b-2 border-black pb-0.5 text-[16pt] font-bold">Birthdays</h2>
              <div className="grid grid-cols-3 gap-x-6 gap-y-5 text-[9pt]">
                {birthdaysByMonth.map((list, i) => (
                  <div key={i} className="break-inside-avoid">
                    <h3 className="mb-1 text-[11pt] font-bold">{MONTH_NAMES[i]}</h3>
                    {list.length === 0 ? (
                      <p className="text-zinc-500">—</p>
                    ) : (
                      list.map((b) => (
                        <p key={`${b.name}${b.day}`} className={clsx("flex gap-2")}>
                          <span className="w-5 text-right tabular-nums">{b.day}</span>
                          <span>{b.name}</span>
                        </p>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
