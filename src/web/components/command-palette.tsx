import clsx from "clsx";
import { ChartColumn, CornerDownLeft, HandHeart, House, Search, UserPlus, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { fullName } from "../lib/format";
import { useSearch } from "../lib/queries";
import { Avatar, StatusBadge } from "./ui";

type Item = { key: string; to: string; label: string; section: string; icon: ReactNode; meta?: ReactNode };

const QUICK_LINKS: Item[] = [
  { key: "new-person", to: "/people/new", label: "Add a person", section: "Quick actions", icon: <UserPlus className="size-4" /> },
  { key: "attendance", to: "/attendance?new=1", label: "Record attendance", section: "Quick actions", icon: <ChartColumn className="size-4" /> },
];

function useDebounced<T>(value: T, ms = 150) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim());
  const { data, isFetching } = useSearch(debounced);
  const navigate = useNavigate();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery("");
      setActive(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    if (!debounced || !data) return QUICK_LINKS;
    return [
      ...data.members.map((m) => ({
        key: `m${m.id}`,
        to: `/people/${m.id}`,
        label: fullName(m),
        section: "People",
        icon: <Avatar person={m} size="sm" />,
        meta: <StatusBadge status={m.status} />,
      })),
      ...data.families.map((f) => ({ key: `f${f.id}`, to: `/households/${f.id}`, label: f.name, section: "Households", icon: <House className="size-4" /> })),
      ...data.groups.map((g) => ({ key: `g${g.id}`, to: `/groups/${g.id}`, label: g.name, section: "Groups", icon: <UsersRound className="size-4" /> })),
      ...data.teams.map((t) => ({ key: `t${t.id}`, to: `/teams/${t.id}`, label: t.name, section: "Teams", icon: <HandHeart className="size-4" /> })),
    ];
  }, [data, debounced]);

  useEffect(() => setActive(0), [items]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  let lastSection = "";
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl open:animate-pop dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="flex items-center gap-3 border-b border-zinc-100 px-4 dark:border-zinc-800">
        <Search className={clsx("size-5 text-zinc-400", isFetching && "animate-pulse")} aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(items[active]);
            }
          }}
          placeholder="Search people, households, groups, teams…"
          aria-label="Search"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-400"
        />
        <kbd className="rounded border border-zinc-200 px-1.5 text-[11px] text-zinc-400 dark:border-zinc-700">esc</kbd>
      </div>
      <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {debounced && data && items.length === 0 && <li className="px-3 py-8 text-center text-sm text-zinc-500">No results for “{debounced}”</li>}
        {items.map((item, i) => {
          const header = item.section !== lastSection ? item.section : null;
          lastSection = item.section;
          return (
            <li key={item.key} role="presentation">
              {header && <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{header}</div>}
              <div
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={clsx(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm",
                  i === active ? "bg-brand-50 text-brand-900 dark:bg-brand-500/15 dark:text-brand-50" : "text-zinc-700 dark:text-zinc-300",
                )}
              >
                <span className="flex size-7 items-center justify-center text-zinc-400">{item.icon}</span>
                <span className="flex-1 truncate font-medium">{item.label}</span>
                {item.meta}
                {i === active && <CornerDownLeft className="size-4 text-zinc-400" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
