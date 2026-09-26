import { House, Pencil, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Family } from "@shared/schemas";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
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
  PersonLink,
  PersonPicker,
  StatusBadge,
  useConfirm,
  useToast,
} from "../components/ui";
import { errorMessage } from "../lib/api";
import { useForm } from "../lib/form";
import { age, fullName, pluralize } from "../lib/format";
import { useDeleteFamily, useFamilies, useFamily, useMembers, useSaveFamily } from "../lib/queries";

function HouseholdDialog({ family, open, onClose }: { family?: Family; open: boolean; onClose: () => void }) {
  const save = useSaveFamily(family?.id);
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm({ name: family?.name ?? "" });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={family ? "Rename household" : "New household"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="household-form" loading={save.isPending}>
            {family ? "Save" : "Create household"}
          </Button>
        </>
      }
    >
      <form
        id="household-form"
        onSubmit={async (e) => {
          e.preventDefault();
          await form.handle(async () => {
            const saved = await save.mutateAsync({ name: form.values.name });
            toast(family ? "Household renamed" : "Household created");
            onClose();
            if (!family) navigate(`/households/${saved.id}`);
          });
        }}
      >
        <Field label="Household name" htmlFor="name" error={form.errors.name} hint="For example, “The Anderson Family”.">
          <Input autoFocus {...form.bind("name")} />
        </Field>
      </form>
    </Modal>
  );
}

export function HouseholdsPage() {
  const { data: families, isLoading, error } = useFamilies();
  const [creating, setCreating] = useState(false);
  if (isLoading) return <LoadingPage />;
  if (error || !families) return <ErrorNotice error={error} />;

  return (
    <>
      <PageHeader
        title="Households"
        description="Families and the people who live together"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New household
          </Button>
        }
      />
      {families.length === 0 ? (
        <Card>
          <EmptyState icon={<House className="size-5" />} title="No households yet" description="Group people who live together so you can see families at a glance." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {families.map((f) => (
            <Link
              key={f.id}
              to={`/households/${f.id}`}
              className="group rounded-xl border border-zinc-200 bg-white p-4 shadow-xs transition hover:border-brand-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-700"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold group-hover:text-brand-700 dark:group-hover:text-brand-300">{f.name}</p>
                <span className="text-xs text-zinc-500">{pluralize(f.members.length, "person", "people")}</span>
              </div>
              <div className="mt-3 flex -space-x-2">
                {f.members.slice(0, 6).map((m) => (
                  <span key={m.id} className="rounded-full ring-2 ring-white dark:ring-zinc-900">
                    <Avatar person={m} size="sm" />
                  </span>
                ))}
              </div>
              <p className="mt-3 line-clamp-2 text-[13px] text-zinc-500">
                {f.members.length ? f.members.map((m) => m.firstName).join(", ") : "No one added yet"}
              </p>
            </Link>
          ))}
        </div>
      )}
      <HouseholdDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function HouseholdPage() {
  const id = Number(useParams().id);
  const { data: family, isLoading, error } = useFamily(id);
  const { data: people = [] } = useMembers();
  const save = useSaveFamily(id);
  const del = useDeleteFamily();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);

  if (isLoading) return <LoadingPage />;
  if (error || !family) return <ErrorNotice error={error} />;

  const memberIds = family.members.map((m) => m.id);
  const setMembers = async (ids: number[], message: string) => {
    try {
      await save.mutateAsync({ memberIds: ids });
      toast(message);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: "/households", label: "Households" }}
        title={family.name}
        description={pluralize(family.members.length, "person", "people")}
        actions={
          <>
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: `Delete ${family.name}?`, message: "The people in it are kept — they just won't belong to a household anymore." })) {
                  await del.mutateAsync(family.id);
                  toast("Household deleted");
                  navigate("/households");
                }
              }}
            >
              Delete
            </Button>
            <Button icon={<Pencil className="size-4" />} onClick={() => setRenaming(true)}>
              Rename
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader title="Members" description="Adults are listed first" />
        {family.members.length === 0 ? (
          <EmptyState icon={<UserPlus className="size-5" />} title="No one in this household yet" />
        ) : (
          <ul className="divide-y divide-zinc-100 px-5 dark:divide-zinc-800">
            {family.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <PersonLink
                    person={m}
                    meta={[m.isChild ? `Child${m.birthdate ? ` · age ${age(m.birthdate)}` : ""}` : null, m.phone, m.email].filter(Boolean).join(" · ")}
                    suffix={<StatusBadge status={m.status} />}
                  />
                </div>
                <IconButton label={`Remove ${fullName(m)} from household`} onClick={() => setMembers(memberIds.filter((x) => x !== m.id), `${m.firstName} removed`)}>
                  <X className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!adding) return;
            const person = people.find((p) => p.id === adding);
            await setMembers([...memberIds, adding], `${person?.firstName ?? "Person"} added`);
            setAdding(null);
          }}
        >
          <div className="flex-1">
            <PersonPicker people={people} value={adding} onChange={setAdding} excludeIds={memberIds} placeholder="Add someone to this household…" />
          </div>
          <Button type="submit" disabled={!adding} loading={save.isPending} icon={<Plus className="size-4" />}>
            Add
          </Button>
        </form>
        {adding && people.find((p) => p.id === adding)?.family && (
          <p className="-mt-2 px-5 pb-4 text-[13px] text-amber-700 dark:text-amber-400">
            They're currently in <Badge>{people.find((p) => p.id === adding)!.family!.name}</Badge> — adding them here moves them.
          </p>
        )}
      </Card>
      <div className="mt-4">
        <ButtonLink to="/people/new" size="sm" variant="ghost" icon={<UserPlus className="size-4" />}>
          Add a brand-new person instead
        </ButtonLink>
      </div>
      <HouseholdDialog key={family.name} family={family} open={renaming} onClose={() => setRenaming(false)} />
    </>
  );
}
