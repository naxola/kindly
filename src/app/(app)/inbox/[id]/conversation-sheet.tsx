"use client";

import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, MessageCircle, MoreHorizontal, X } from "lucide-react";
import type { ConversationThreadState } from "@/modules/conversations/service";
import { useInboxFocusList, useInboxOrderList } from "@/app/(app)/inbox/inbox-order-context";
import { setChatAnchored } from "@/components/shell/sidebar-auto-collapse";
import { useMediaQuery } from "@/lib/use-media-query";
import { ConversationThread } from "@/app/(app)/inbox/[id]/conversation-thread";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ANCHORED_QUERY = "(min-width: 1280px)";
const MODAL_QUERY = "(min-width: 768px)";

/**
 * `SheetTitle`/`SheetDescription` wrap Radix's `Dialog.Title`/`Description`,
 * which throw outside a `Dialog.Root` — unusable in the anchored `aside`,
 * which is deliberately not a Dialog at all (docs/ui/CHAT.md §4). Same
 * classes, plain elements, so the anchored and modal chrome still match.
 */
function PanelTitle({ anchored, id, children }: { anchored: boolean; id?: string; children: ReactNode }) {
  if (anchored) {
    return (
      <h2 id={id} className="truncate type-section-title text-foreground">
        {children}
      </h2>
    );
  }
  return <SheetTitle className="truncate">{children}</SheetTitle>;
}

function PanelDescription({ anchored, children }: { anchored: boolean; children: ReactNode }) {
  if (anchored) {
    return <p className="truncate type-body text-foreground-lighter">{children}</p>;
  }
  return <SheetDescription className="truncate">{children}</SheetDescription>;
}

export interface ConversationSheetProps {
  conversationId: string;
  contact: { id: string; name: string; isUnassigned: boolean };
  channel: string;
  delegateName: string;
  otherContacts: { id: string; name: string }[];
  threadState: ConversationThreadState;
  supportsTyping: boolean;
  /** `"back"`: reached by soft navigation, `router.back()` restores the list's exact prior state. `"push"`: reached by a direct/hard load, so there is no prior in-app history entry to return to. */
  closeMode: "back" | "push";
  closeHref: string;
  markContactIdentified: () => Promise<void>;
  reassignConversation: (formData: FormData) => Promise<void>;
}

/**
 * The conversation panel (docs/ui/CHAT.md), one component reused from both
 * routing entry points (`@sheet/(.)[id]` on soft navigation, `[id]/page.tsx`
 * on a direct load). Picks its own chrome by viewport: anchored `aside`
 * without an overlay on `xl+`, a modal `Sheet` below that, full screen
 * under `md` — see `useMediaQuery`'s own note on why this needs JS rather
 * than a CSS breakpoint.
 */
export function ConversationSheet(props: ConversationSheetProps) {
  const { conversationId, contact, channel, delegateName, otherContacts, threadState, supportsTyping, closeMode, closeHref } =
    props;
  const router = useRouter();
  const isAnchored = useMediaQuery(ANCHORED_QUERY);
  const isModalOrWider = useMediaQuery(MODAL_QUERY);
  const order = useInboxOrderList();
  const focusListRef = useInboxFocusList();
  const panelRef = useRef<HTMLDivElement>(null);

  // Anchored (docs/ui/CHAT.md §4): sidebar + ContextNav + list + a 560px
  // panel rarely fit together at once, so the sidebar collapses for as
  // long as this is open — reverted on close/unmount, never persisted.
  useEffect(() => {
    if (!isAnchored) {
      return;
    }
    setChatAnchored(true);
    return () => setChatAnchored(false);
  }, [isAnchored]);

  const { previousId, nextId } = useMemo(() => {
    const index = order.indexOf(conversationId);
    return {
      previousId: index > 0 ? order[index - 1] : null,
      nextId: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
    };
  }, [conversationId, order]);

  const close = useCallback(() => {
    if (closeMode === "back") {
      router.back();
    } else {
      router.push(closeHref);
    }
  }, [closeMode, closeHref, router]);

  // The anchored panel is not a Dialog, so `Esc` needs its own listener —
  // only while focus is inside it, matching the modal Sheet's own Esc
  // (which never fires for a click or key event outside it either).
  useEffect(() => {
    if (!isAnchored) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && panelRef.current?.contains(document.activeElement)) {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isAnchored, close]);

  // `F6` moves focus to the list's active row, `Ctrl+F6` back to this panel
  // — the anchored mode's stand-in for a focus trap it deliberately does
  // not have (docs/ui/ACCESSIBILITY.md §2).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "F6") return;
      event.preventDefault();
      if (event.ctrlKey) {
        panelRef.current?.querySelector<HTMLElement>("textarea, button, a")?.focus();
      } else {
        focusListRef.current?.();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusListRef]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey) return;
      if (event.key === "ArrowDown" && nextId) {
        event.preventDefault();
        router.push(`/inbox/${nextId}`);
      } else if (event.key === "ArrowUp" && previousId) {
        event.preventDefault();
        router.push(`/inbox/${previousId}`);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [nextId, previousId, router]);

  const titleId = useId();

  const header = (
    <SheetHeader className="flex-row items-start justify-between gap-2 space-y-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <Avatar name={contact.name} badge={<MessageCircle aria-label={channel} className="size-2.5" />} />
        <div className="min-w-0">
          <PanelTitle anchored={isAnchored} id={titleId}>
            <Link href={`/contacts/${contact.id}`} className="hover:underline">
              {contact.name}
            </Link>
          </PanelTitle>
          <PanelDescription anchored={isAnchored}>
            {channel} · Delegado: {delegateName}
          </PanelDescription>
          {contact.isUnassigned && (
            <Badge tone="warning" className="mt-1">
              Sin identificar
            </Badge>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!previousId}
          disabledReason={previousId ? undefined : "No hay conversación anterior en esta lista"}
          onClick={() => previousId && router.push(`/inbox/${previousId}`)}
          aria-label="Conversación anterior"
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!nextId}
          disabledReason={nextId ? undefined : "No hay conversación siguiente en esta lista"}
          onClick={() => nextId && router.push(`/inbox/${nextId}`)}
          aria-label="Conversación siguiente"
        >
          <ChevronDown />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Más acciones">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem asChild>
              <Link href={`/contacts/${contact.id}`}>Ver contacto</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon-sm" onClick={close} aria-label={isModalOrWider ? "Cerrar conversación" : "Volver a la bandeja"}>
          {isModalOrWider ? <X /> : <ArrowLeft />}
        </Button>
      </div>
    </SheetHeader>
  );

  const contextualAlert = contact.isUnassigned && (
    <div className="px-4 pt-3">
      <Alert
        tone="warning"
        title="Contacto no identificado"
        actions={
          <>
            <form action={props.markContactIdentified}>
              <Button type="submit" size="sm">
                Marcar como identificado
              </Button>
            </form>
            {otherContacts.length > 0 && (
              <form action={props.reassignConversation} className="flex items-center gap-2">
                <NativeSelect name="targetContactId" aria-label="Reasignar a" className="w-auto" defaultValue="">
                  <option value="" disabled>
                    Reasignar a...
                  </option>
                  {otherContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="submit" size="sm" variant="outline">
                  Reasignar
                </Button>
              </form>
            )}
          </>
        }
      >
        Creado automáticamente a partir de este mensaje.
      </Alert>
    </div>
  );

  const content = (
    <>
      {header}
      {contextualAlert}
      <ConversationThread conversationId={conversationId} initialState={threadState} supportsTyping={supportsTyping} />
    </>
  );

  if (isAnchored) {
    return (
      <aside
        ref={panelRef}
        aria-labelledby={titleId}
        // No Radix here to gate this on `data-state=open` (there is no
        // modal), so it just plays once on mount — matches the modal
        // Sheet's own entrance, which the user expects even anchored.
        className="flex h-full w-sheet-md shrink-0 flex-col border-l border-border bg-surface-200 animate-slide-in-right"
      >
        {content}
      </aside>
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" size={isModalOrWider ? "md" : "full"} showClose={false}>
        {content}
      </SheetContent>
    </Sheet>
  );
}
