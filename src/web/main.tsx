import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider } from "react-router";
import { AppLayout } from "./components/layout";
import { ConfirmProvider, EmptyState, ToastProvider } from "./components/ui";
import { ApiError, setUnauthorizedHandler } from "./lib/api";
import { AttendancePage } from "./pages/attendance";
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from "./pages/auth";
import { DashboardPage } from "./pages/dashboard";
import { HouseholdPage, HouseholdsPage } from "./pages/households";
import { MemberFormPage, MemberPage } from "./pages/member";
import { GroupPage, GroupsPage, TeamPage, TeamsPage } from "./pages/ministry";
import { PeoplePage } from "./pages/people";
import { SettingsPage } from "./pages/settings";
import "@fontsource-variable/figtree";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

// A 401 mid-session means the session expired: drop cached data so the layout redirects to sign-in.
setUnauthorizedHandler(() => queryClient.setQueryData(["me"], null));

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="That page doesn't exist or may have been deleted."
      action={<Link to="/" className="font-medium text-brand-700 hover:underline dark:text-brand-300">Go to the dashboard</Link>}
    />
  );
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  // Standalone screens load on demand so the main app bundle stays small.
  { path: "/r/:token", lazy: () => import("./pages/leader-report").then((m) => ({ Component: m.LeaderReportPage })) },
  { path: "/kiosk", lazy: () => import("./pages/kiosk").then((m) => ({ Component: m.KioskPage })) },
  { path: "/directory/print", lazy: () => import("./pages/directory").then((m) => ({ Component: m.DirectoryPrintPage })) },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "people", element: <PeoplePage /> },
      { path: "people/new", element: <MemberFormPage /> },
      { path: "people/:id", element: <MemberPage /> },
      { path: "people/:id/edit", element: <MemberFormPage /> },
      { path: "households", element: <HouseholdsPage /> },
      { path: "households/:id", element: <HouseholdPage /> },
      { path: "directory", lazy: () => import("./pages/directory").then((m) => ({ Component: m.DirectoryPage })) },
      { path: "groups", element: <GroupsPage /> },
      { path: "groups/:id", element: <GroupPage /> },
      { path: "teams", element: <TeamsPage /> },
      { path: "teams/:id", element: <TeamPage /> },
      { path: "attendance", element: <AttendancePage /> },
      { path: "checkin", lazy: () => import("./pages/checkin").then((m) => ({ Component: m.CheckinPage })) },
      { path: "app-accounts", lazy: () => import("./pages/app-accounts").then((m) => ({ Component: m.AppAccountsPage })) },
      { path: "usage", lazy: () => import("./pages/usage").then((m) => ({ Component: m.UsagePage })) },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
