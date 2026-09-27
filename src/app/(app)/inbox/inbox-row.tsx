import { MessageCircle } from "lucide-react";
import type { ConversationPreview } from "@/modules/conversations/service";
import { Avatar } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { DeliveryTicks } from "@/app/(app)/inbox/[id]/delivery-ticks";
import { cn } from "@/lib/cn";

/**
 * One conversation, two lines (docs/ui/INBOX.md §3). The channel badge on
 * the avatar is a generic icon for now, `channel` as its accessible name —
 * WhatsApp/Telegram aren't real channels yet (`docs/DECISIONS.md`), so a
 * per-provider icon would be guessing at something that doesn't exist.
 */
export function InboxRow({
  conversation,
  delegateName,
  showDelegate,
}: {
  conversation: ConversationPreview;
  delegateName: string | undefined;
  showDelegate: boolean;
}) {
  const { unread, lastMessage } = conversation;
  const isOutbound = lastMessage?.direction === "OUTBOUND";

  return (
    <div className="flex items-center gap-3 border-b border-border px-3 py-2.5 group-hover:bg-state-hover last:border-0">
      <Avatar name={conversation.contactName} badge={<MessageCircle aria-label={conversation.channel} className="size-2.5" />} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {unread && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />}
          {/* `min-w-0 flex-1`: the name is the row's primary signal (who),
              so it claims space first — the delegate name below is capped
              instead, so a long one can never squeeze this out entirely
              (real, seen with the anchored panel narrowing the list, UI-6). */}
          <span
            className={cn(
              "min-w-0 flex-1 truncate type-label",
              unread ? "font-semibold text-foreground" : "text-foreground",
            )}
          >
            {conversation.contactName}
          </span>
          {conversation.contactIsUnassigned && (
            <Badge tone="warning" className="shrink-0">
              Sin identificar
            </Badge>
          )}
          {showDelegate && delegateName && (
            <span className="hidden max-w-24 shrink-0 truncate type-caption text-foreground-lighter @sm:inline">
              · {delegateName}
            </span>
          )}
          <span
            className={cn(
              "ml-auto shrink-0 type-caption",
              unread ? "font-semibold text-primary" : "text-foreground-lighter",
            )}
          >
            {lastMessage ? <RelativeTime date={lastMessage.createdAt} /> : null}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className={cn("min-w-0 flex-1 truncate type-caption", unread ? "text-foreground-light" : "text-foreground-lighter")}>
            {lastMessage ? (
              <>
                {isOutbound && "Tú: "}
                {lastMessage.body}
              </>
            ) : (
              "Sin mensajes"
            )}
          </p>
          {isOutbound && !conversation.unread && (
            <DeliveryTicks status={lastMessage.deliveryStatus === "PENDING" ? "SENDING" : lastMessage.deliveryStatus} />
          )}
        </div>
      </div>
    </div>
  );
}
