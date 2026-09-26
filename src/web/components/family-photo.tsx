import clsx from "clsx";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { errorMessage } from "../lib/api";
import { useFamilyPhoto } from "../lib/queries";
import { Button, useConfirm, useToast } from "./ui";

/** Initials placeholder shown where a household has no photo yet. */
function Placeholder({ title, className }: { title: string; className?: string }) {
  const letters = title
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <div className={clsx("flex items-center justify-center bg-zinc-100 text-2xl font-semibold text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500", className)}>
      {letters}
    </div>
  );
}

export function FamilyPhotoView({ photoUrl, title, className }: { photoUrl: string | null; title: string; className?: string }) {
  return photoUrl ? (
    <img src={photoUrl} alt={`${title} family photo`} loading="lazy" className={clsx("object-cover", className)} />
  ) : (
    <Placeholder title={title} className={className} />
  );
}

/** A household photo with add / replace / remove controls. */
export function FamilyPhotoEditor({
  familyId,
  photoUrl,
  title,
  className,
  compact,
}: {
  familyId: number;
  photoUrl: string | null;
  title: string;
  className?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, remove } = useFamilyPhoto(familyId);
  const toast = useToast();
  const confirm = useConfirm();
  const busy = upload.isPending || remove.isPending;

  const choose = () => input.current?.click();
  const onFile = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, {
      onSuccess: () => toast(photoUrl ? "Photo replaced" : "Photo added"),
      onError: (e) => toast(errorMessage(e), "error"),
    });
  };

  return (
    <div className={clsx("group relative overflow-hidden", className)}>
      <FamilyPhotoView photoUrl={photoUrl} title={title} className="size-full" />
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium dark:bg-zinc-900/70">Uploading…</div>}
      {compact ? (
        <button
          type="button"
          onClick={choose}
          aria-label={photoUrl ? `Replace ${title} photo` : `Add ${title} photo`}
          className="absolute inset-0 flex items-end justify-end p-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
        >
          <span className="flex items-center gap-1 rounded-full bg-zinc-900/75 px-2.5 py-1 text-xs font-medium text-white">
            <Camera className="size-3.5" aria-hidden /> {photoUrl ? "Replace" : "Add photo"}
          </span>
        </button>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-2 bg-gradient-to-t from-black/50 to-transparent p-3">
          <Button size="sm" onClick={choose} disabled={busy} icon={<ImagePlus className="size-4" />}>
            {photoUrl ? "Replace photo" : "Add photo"}
          </Button>
          {photoUrl && (
            <Button
              size="sm"
              disabled={busy}
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: "Remove this photo?", message: `The ${title} photo will be removed from the directory.`, confirmLabel: "Remove" })) {
                  remove.mutate(undefined, { onSuccess: () => toast("Photo removed"), onError: (e) => toast(errorMessage(e), "error") });
                }
              }}
            >
              Remove
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
