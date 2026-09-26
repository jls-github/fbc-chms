import clsx from "clsx";
import { Check, ChevronDown, LoaderCircle, Search, X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router";
import { MEMBER_STATUS_LABELS, type MemberStatus } from "@shared/constants";
import type { PersonRef } from "@shared/schemas";
import { fullName, initials } from "../lib/format";

// ------------------------------------------------------------------ buttons

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonStyles = (variant: ButtonVariant = "secondary", size: ButtonSize = "md") =>
  clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors select-none",
    "disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
    {
      primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 dark:text-white",
      secondary:
        "border border-zinc-200 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
      ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
      danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
    }[variant],
  );

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={clsx(buttonStyles(variant, size), className)} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  to,
  variant,
  size,
  icon,
  children,
  className,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={clsx(buttonStyles(variant, size), className)}>
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
        className,
      )}
      {...rest}
    />
  );
}

// ------------------------------------------------------------------- fields

const controlStyles = (invalid?: boolean) =>
  clsx(
    "block w-full rounded-lg border bg-white px-3 text-sm text-zinc-900 shadow-xs transition-colors placeholder:text-zinc-400",
    "focus:outline-none focus:ring-3 dark:bg-zinc-900 dark:text-zinc-100",
    invalid
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
      : "border-zinc-300 focus:border-brand-500 focus:ring-brand-500/20 dark:border-zinc-700",
  );

export function Field({
  label,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={clsx(controlStyles(invalid), "h-9", className)} {...rest} />;
});

export function Textarea({ invalid, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={clsx(controlStyles(invalid), "min-h-20 py-2", className)} {...rest} />;
}

export function Select({ invalid, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={clsx(controlStyles(invalid), "h-9 appearance-none pr-8", className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
    </div>
  );
}

export function Checkbox({ label, description, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 rounded border-zinc-300 accent-brand-600 dark:border-zinc-600"
        {...rest}
      />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        {description && <span className="block text-zinc-500">{description}</span>}
      </label>
    </div>
  );
}

// ------------------------------------------------------------------ surface

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{title}</h1>
          {description && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {icon}
        </div>
      )}
      <p className="font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-zinc-200/70 dark:bg-zinc-800", className)} />;
}

export function LoadingPage() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
      {error instanceof Error ? error.message : "Something went wrong."}
    </div>
  );
}

// ------------------------------------------------------------------- people

const STATUS_STYLES: Record<MemberStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20",
  prospective: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-400/20",
  guest: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20",
  inactive: "bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-400 dark:ring-zinc-400/20",
  archived: "bg-zinc-100 text-zinc-500 ring-zinc-500/15 dark:bg-zinc-500/10 dark:text-zinc-500 dark:ring-zinc-400/15",
};

export function StatusBadge({ status }: { status: MemberStatus }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLES[status])}>
      {MEMBER_STATUS_LABELS[status]}
    </span>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        className,
      )}
    >
      {children}
    </span>
  );
}

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

export function Avatar({ person, size = "md" }: { person: { id: number; firstName: string; lastName: string }; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_COLORS[person.id % AVATAR_COLORS.length],
        { sm: "size-7 text-[11px]", md: "size-9 text-[13px]", lg: "size-16 text-xl" }[size],
      )}
    >
      {initials(person)}
    </span>
  );
}

export function PersonLink({ person, suffix, meta }: { person: PersonRef; suffix?: ReactNode; meta?: ReactNode }) {
  return (
    <Link
      to={`/people/${person.id}`}
      className="group flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
    >
      <Avatar person={person} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-zinc-900 group-hover:text-brand-700 dark:text-zinc-100 dark:group-hover:text-brand-300">
          {fullName(person)}
        </span>
        {meta && <span className="block truncate text-xs text-zinc-500">{meta}</span>}
      </span>
      {suffix}
    </Link>
  );
}

// ------------------------------------------------------------------ dialogs

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl open:animate-pop dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100",
        size === "lg" ? "max-w-2xl" : "max-w-md",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-1">
              <X className="size-4" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

type ConfirmOptions = { title: string; message: string; confirmLabel?: string; danger?: boolean };
const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ""}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger === false ? "primary" : "danger"} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

// ------------------------------------------------------------------- toasts

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={clsx(
              "pointer-events-auto flex animate-pop items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg",
              t.tone === "error" ? "bg-red-600 text-white" : "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900",
            )}
          >
            {t.tone === "success" && <Check className="size-4 text-emerald-400 dark:text-emerald-600" aria-hidden />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ------------------------------------------------------------ member picker

/** Searchable single-select over a list of people. */
export function PersonPicker({
  people,
  value,
  onChange,
  placeholder = "Search people…",
  excludeIds = [],
  autoFocus,
}: {
  people: PersonRef[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  excludeIds?: number[];
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const selected = people.find((p) => p.id === value) ?? null;

  const options = useMemo(() => {
    const excluded = new Set(excludeIds);
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => !excluded.has(p.id))
      .filter((p) => !q || fullName(p).toLowerCase().includes(q) || `${p.lastName} ${p.firstName}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [people, excludeIds, query]);

  const choose = (p: PersonRef) => {
    onChange(p.id);
    setQuery("");
    setOpen(false);
  };

  if (selected) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white pr-1 pl-2 dark:border-zinc-700 dark:bg-zinc-900">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <Avatar person={selected} size="sm" />
          <span className="truncate">{fullName(selected)}</span>
        </span>
        <IconButton label="Clear selection" onClick={() => onChange(null)}>
          <X className="size-4" />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        className="pl-8"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && options[active]) {
            e.preventDefault();
            choose(options[active]);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">No matches</li>
          ) : (
            options.map((p, i) => (
              <li
                key={p.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                onMouseEnter={() => setActive(i)}
                className={clsx(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  i === active && "bg-brand-50 text-brand-900 dark:bg-brand-500/15 dark:text-brand-100",
                )}
              >
                <Avatar person={p} size="sm" />
                <span className="truncate">{fullName(p)}</span>
                {p.isChild && <Badge className="ml-auto">Child</Badge>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/** Segmented control, used for view toggles and filters. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/80">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors",
            o.value === value
              ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="text-zinc-400 tabular-nums dark:text-zinc-500">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
