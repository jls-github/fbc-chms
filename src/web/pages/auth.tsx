import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { AuthLayout } from "../components/layout";
import { Button, ErrorNotice, Field, Input, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useForm } from "../lib/form";
import { useLogin, useMe } from "../lib/queries";

export function LoginPage() {
  const { data: me } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useForm({ email: "", password: "" });
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (me) return <Navigate to={from} replace />;

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in with your staff account.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await form.handle(() => login.mutateAsync(form.values))) navigate(from, { replace: true });
        }}
      >
        {form.formError && !Object.keys(form.errors).length && <ErrorNotice error={new Error(form.formError)} />}
        <Field label="Email" htmlFor="email" error={form.errors.email}>
          <Input type="email" autoComplete="username" required autoFocus {...form.bind("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={form.errors.password}>
          <Input type="password" autoComplete="current-password" required {...form.bind("password")} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={login.isPending}>
          Sign in
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useForm({ email: "" });
  const [pending, setPending] = useState(false);

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
          <p>If an account exists for <strong className="text-zinc-900 dark:text-zinc-100">{form.values.email}</strong>, a reset link is on its way. It expires in one hour.</p>
          <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-300">← Back to sign in</Link>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            if (await form.handle(() => api.post("/auth/password/forgot", form.values))) setSent(true);
            setPending(false);
          }}
        >
          {form.formError && <ErrorNotice error={new Error(form.formError)} />}
          <Field label="Email" htmlFor="email" error={form.errors.email}>
            <Input type="email" autoComplete="username" required autoFocus {...form.bind("email")} />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={pending}>
            Email me a reset link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-medium text-brand-700 hover:underline dark:text-brand-300">Back to sign in</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({ password: "", confirm: "" });
  const [pending, setPending] = useState(false);

  return (
    <AuthLayout title="Choose a new password">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (form.values.password !== form.values.confirm) {
            await form.handle(async () => {
              throw new ApiError(422, "Passwords don't match.", { confirm: ["Passwords don't match"] });
            });
            return;
          }
          setPending(true);
          const ok = await form.handle(() => api.post("/auth/password/reset", { token, password: form.values.password }));
          setPending(false);
          if (ok) {
            toast("Password updated. Please sign in.");
            navigate("/login");
          }
        }}
      >
        {form.formError && !form.errors.password && !form.errors.confirm && <ErrorNotice error={new Error(form.formError)} />}
        <Field label="New password" htmlFor="password" error={form.errors.password} hint="At least 8 characters.">
          <Input type="password" autoComplete="new-password" required autoFocus {...form.bind("password")} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={form.errors.confirm}>
          <Input type="password" autoComplete="new-password" required {...form.bind("confirm")} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" loading={pending}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
