import type { InviteResponse } from "@shared/schemas";
import { formatDay } from "../lib/format";
import { Button, Modal, useToast } from "./ui";

/** Shows a new member-app invitation code and link, ready to share. */
export function InvitationDialog({ invitation, name, onClose }: { invitation: InviteResponse; name: string; onClose: () => void }) {
  const toast = useToast();
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast("Couldn't copy — select it and copy manually", "error");
    }
  };
  const message = `You're invited to the FBC Enumclaw app! Set up your account here: ${invitation.link} (or open the app and enter code ${invitation.code})`;
  return (
    <Modal
      open
      onClose={onClose}
      title={`${name} is invited`}
      description={invitation.emailed ? "We emailed them the invitation too." : "Send them the link or code by text or email."}
      footer={
        <>
          <Button onClick={() => copy(message, "Message")}>Copy a message to send</Button>
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="rounded-xl bg-zinc-50 p-4 text-center dark:bg-zinc-800/60">
        <p className="text-sm text-zinc-500">Invitation code</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-[0.15em]">{invitation.code}</p>
        <p className="mt-2 text-xs text-zinc-500">Expires {formatDay(invitation.expiresAt.slice(0, 10))}</p>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-zinc-100 px-2 py-1.5 text-xs dark:bg-zinc-800">{invitation.link}</code>
        <Button size="sm" onClick={() => copy(invitation.link, "Link")}>Copy link</Button>
      </div>
    </Modal>
  );
}
