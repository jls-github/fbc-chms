import clsx from "clsx";
import {
  Baby,
  BookUser,
  ChartColumn,
  Church,
  House,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  UsersRound,
  HandHeart,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useLogout, useMe } from "../lib/queries";
import { CommandPalette } from "./command-palette";
import { IconButton, useToast } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/people", label: "People", icon: Users },
  { to: "/households", label: "Households", icon: House },
  { to: "/directory", label: "Directory", icon: BookUser },
  { to: "/groups", label: "Groups", icon: UsersRound },
  { to: "/teams", label: "Teams", icon: HandHeart },
  { to: "/attendance", label: "Attendance", icon: ChartColumn },
  { to: "/checkin", label: "Kids check-in", icon: Baby },
];

/** Volunteers only ever see check-in (the API enforces this too). */
const navFor = (role: string | undefined) => (role === "volunteer" ? NAV.filter((n) => n.to === "/checkin") : NAV);
const VOLUNTEER_PATHS = ["/checkin", "/settings"];

type Theme = "light" | "dark" | "system";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && media.matches));
    apply();
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* private mode */
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return [theme, setTheme] as const;
}

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
  const Icon = { system: Monitor, light: Sun, dark: Moon }[theme];
  return (
    <IconButton label={`Theme: ${theme} (click to change)`} onClick={() => setTheme(next[theme])}>
      <Icon className="size-4" />
    </IconButton>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
        <Church className="size-[18px]" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-white">FBC Enumclaw</span>
        <span className="block text-xs text-zinc-500">Church Management</span>
      </span>
    </div>
  );
}

function SidebarContent({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const toast = useToast();

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <Brand />
      {me?.role !== "volunteer" && <button
        type="button"
        onClick={onSearch}
        className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-500 shadow-xs hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border border-zinc-200 px-1.5 font-sans text-[11px] text-zinc-400 sm:inline dark:border-zinc-700">⌘K</kbd>
      </button>}
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {navFor(me?.role).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                "flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700"
                  : "text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={clsx("size-[18px]", isActive ? "text-brand-600 dark:text-brand-400" : "text-zinc-400")} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              "mb-2 flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium",
              isActive ? "bg-white text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-white dark:ring-zinc-700" : "text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
            )
          }
        >
          <Settings className="size-[18px] text-zinc-400" aria-hidden />
          Settings
        </NavLink>
        <div className="flex items-center gap-2 px-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{me?.name ?? me?.email}</p>
            {me?.name && <p className="truncate text-xs text-zinc-500">{me.email}</p>}
          </div>
          <ThemeToggle />
          <IconButton
            label="Sign out"
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => {
                  navigate("/login");
                  toast("Signed out");
                },
              })
            }
          >
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && me?.role !== "volunteer") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [me?.role]);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  if (isLoading) return <div className="min-h-screen" aria-busy="true" />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (me.sessionKind === "kiosk") return <Navigate to="/kiosk" replace />;
  if (me.role === "volunteer" && !VOLUNTEER_PATHS.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/checkin" replace />;
  }

  const openSearch = () => {
    setDrawerOpen(false);
    setSearchOpen(true);
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-zinc-200 bg-zinc-100/60 lg:block dark:border-zinc-800 dark:bg-zinc-950">
        <SidebarContent onSearch={openSearch} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/85 px-3 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-950/85">
        <IconButton label="Open menu" onClick={() => setDrawerOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
        <Brand />
        {me.role !== "volunteer" ? (
          <IconButton label="Search" onClick={openSearch}>
            <Search className="size-5" />
          </IconButton>
        ) : (
          <span className="size-8" />
        )}
      </header>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-in bg-zinc-950/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] animate-slide bg-zinc-50 shadow-xl dark:bg-zinc-950">
            <IconButton label="Close menu" className="absolute top-3 right-3" onClick={() => setDrawerOpen(false)}>
              <X className="size-5" />
            </IconButton>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} onSearch={openSearch} />
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-zinc-50 px-4 py-12 dark:from-zinc-900 dark:to-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
