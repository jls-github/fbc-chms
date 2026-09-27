import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUpRight, CircleAlert, Send } from "lucide-react";
import { useEffect, useState } from "react";
import type { FacebookPost, FacebookStatus } from "@shared/schemas";
import { Badge, Button, Card, CardHeader, Checkbox, Field, Skeleton, Textarea, useConfirm, useToast } from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { formatDay } from "../lib/format";

const STATUS_LABELS: Record<FacebookPost["status"], string> = {
  posting: "Posting…",
  posted: "Posted",
  failed: "Failed",
  skipped: "Skipped",
  missing: "Not on the website",
};

function PostBadge({ status }: { status: FacebookPost["status"] }) {
  return (
    <Badge
      className={clsx({
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300": status === "posted",
        "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300": status === "failed" || status === "missing",
      })}
    >
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const FacebookLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-brand-700 hover:underline dark:text-brand-300">
    {children} <ArrowUpRight className="size-3.5" aria-hidden />
  </a>
);

const daysUntil = (iso: string) => Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);

/** Admins: the Monday-morning sermon post to the church's Facebook Page. */
export function FacebookPosts() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isLoading } = useQuery({ queryKey: ["facebook"], queryFn: () => api.get<FacebookStatus>("/facebook") });
  const refresh = () => qc.invalidateQueries({ queryKey: ["facebook"] });
  const onError = (e: unknown) => toast(errorMessage(e), "error");

  const save = useMutation({
    mutationFn: (body: { autoPost?: boolean; template?: string | null }) => api.patch("/facebook", body),
    onSuccess: () => {
      void refresh();
      toast("Saved");
    },
    onError,
  });
  const postNow = useMutation({
    mutationFn: () => api.post("/facebook/post"),
    onSuccess: () => toast("Posted to Facebook"),
    onError,
    onSettled: refresh,
  });
  const skip = useMutation({
    mutationFn: (value: boolean) => api.post("/facebook/skip", { skip: value }),
    onSuccess: (_, value) => toast(value ? "This week will be skipped" : "This week will be posted"),
    onError,
    onSettled: refresh,
  });

  const [template, setTemplate] = useState("");
  useEffect(() => {
    if (data) setTemplate(data.template);
  }, [data?.template]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = <CardHeader title="Facebook" description="Posts Sunday's sermon to the church's Facebook Page every Monday morning" />;
  if (isLoading || !data) {
    return (
      <Card>
        {header}
        <div className="px-5 py-4"><Skeleton className="h-16" /></div>
      </Card>
    );
  }

  if (!data.configured) {
    return (
      <Card>
        {header}
        <p className="px-5 py-4 text-sm text-zinc-600 dark:text-zinc-400">
          Not connected. Set <code>FACEBOOK_PAGE_ID</code> and <code>FACEBOOK_PAGE_TOKEN</code> on the server (see docs/DEPLOYING.md).
        </p>
      </Card>
    );
  }

  const { thisWeek } = data;
  const post = thisWeek.post;
  const done = post?.status === "posted" || post?.status === "posting";
  const expiresIn = data.dataAccessExpiresAt ? daysUntil(data.dataAccessExpiresAt) : null;

  return (
    <Card>
      {header}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {/* Connection */}
        <div className="space-y-3 px-5 py-4 text-sm">
          {data.page ? (
            <p className="text-zinc-600 dark:text-zinc-400">
              Connected to{" "}
              {data.page.link ? <FacebookLink href={data.page.link}>{data.page.name}</FacebookLink> : <strong>{data.page.name}</strong>}
              {data.dataAccessExpiresAt && (
                <span className={clsx(expiresIn !== null && expiresIn <= 14 && "font-medium text-red-600 dark:text-red-400")}>
                  {" "}· reconnect by {formatDay(new Date(data.dataAccessExpiresAt).toLocaleDateString("en-CA"))}
                </span>
              )}
            </p>
          ) : (
            <p className="flex items-start gap-2 text-red-700 dark:text-red-400">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Facebook didn't accept the Page token: {data.pageError}. Generate a new one (see docs/DEPLOYING.md).</span>
            </p>
          )}
          <Checkbox
            label="Post automatically"
            description={`${data.schedule}. If Sunday's sermon isn't on the website by noon, admins get an email instead.`}
            checked={data.autoPost}
            disabled={save.isPending}
            onChange={(e) => save.mutate({ autoPost: e.target.checked })}
          />
        </div>

        {/* This week */}
        <div className="space-y-3 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              Sunday, {formatDay(thisWeek.sunday)} {post && <PostBadge status={post.status} />}
            </h3>
            <div className="flex gap-2">
              {!done && post?.status !== "skipped" && (
                <Button size="sm" variant="ghost" loading={skip.isPending} onClick={() => skip.mutate(true)}>
                  Skip this week
                </Button>
              )}
              {post?.status === "skipped" && (
                <Button size="sm" variant="ghost" loading={skip.isPending} onClick={() => skip.mutate(false)}>
                  Don't skip
                </Button>
              )}
              {!done && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Send className="size-4" />}
                  disabled={!thisWeek.sermon}
                  loading={postNow.isPending}
                  onClick={async () => {
                    if (await confirm({ title: "Post to Facebook now?", message: `“${thisWeek.sermon?.title}” will be posted to ${data.page?.name ?? "the church's Page"} right away.`, confirmLabel: "Post", danger: false })) {
                      postNow.mutate();
                    }
                  }}
                >
                  Post now
                </Button>
              )}
            </div>
          </div>
          {post?.status === "posted" ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              “{post.sermonTitle}” was posted{post.postedAt && ` ${formatDay(new Date(post.postedAt).toLocaleDateString("en-CA"))}`}
              {post.byName ? ` by ${post.byName}` : " automatically"}.{" "}
              {post.facebookUrl && <FacebookLink href={post.facebookUrl}>View on Facebook</FacebookLink>}
            </p>
          ) : thisWeek.sermon && thisWeek.preview ? (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Preview</p>
              <p className="mt-1 text-sm whitespace-pre-line">{thisWeek.preview}</p>
              <a href={thisWeek.sermon.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-3 rounded-md bg-zinc-50 p-2 hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800">
                {thisWeek.sermon.thumbnailUrl && <img src={thisWeek.sermon.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" />}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{thisWeek.sermon.title}</span>
                  <span className="block truncate text-xs text-zinc-500">fbcenumclaw.com</span>
                </span>
              </a>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">This Sunday's sermon isn't on fbcenumclaw.com yet. The preview appears here once it's uploaded.</p>
          )}
          {post?.status === "failed" && post.error && (
            <p className="text-sm text-red-700 dark:text-red-400">
              Facebook said: {post.error} ({post.attempts} {post.attempts === 1 ? "try" : "tries"})
            </p>
          )}
        </div>

        {/* Template */}
        <form
          className="space-y-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ template });
          }}
        >
          <Field
            label="Message"
            htmlFor="fb-template"
            hint={`Fill-ins: ${data.templateFields.map((f) => `{${f}}`).join(", ")}. A line whose fill-ins are all blank is left out. The link preview with the sermon artwork is added automatically.`}
          >
            <Textarea id="fb-template" rows={3} value={template} onChange={(e) => setTemplate(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={template === data.template} loading={save.isPending}>
              Save message
            </Button>
            {data.template !== data.defaultTemplate && (
              <Button size="sm" variant="ghost" onClick={() => save.mutate({ template: null })}>
                Reset to default
              </Button>
            )}
          </div>
        </form>

        {/* History */}
        {data.history.some((p) => p.sunday !== thisWeek.sunday) && (
          <div className="px-5 py-4">
            <h3 className="mb-2 text-sm font-semibold">Earlier weeks</h3>
            <ul className="space-y-1.5 text-sm">
              {data.history
                .filter((p) => p.sunday !== thisWeek.sunday)
                .map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2">
                    <span className="w-28 shrink-0 text-zinc-500">{formatDay(p.sunday)}</span>
                    <span className="min-w-0 flex-1 truncate">{p.sermonTitle ?? "—"}</span>
                    <PostBadge status={p.status} />
                    {p.facebookUrl && <FacebookLink href={p.facebookUrl}>View</FacebookLink>}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
