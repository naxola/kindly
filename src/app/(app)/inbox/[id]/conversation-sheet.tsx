"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, MessageCircle, MoreHorizontal, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import type { ConversationThreadState } from "@/modules/conversations/service";
import { useInboxFocusList, useInboxOrderList } from "@/app/(app)/inbox/inbox-order-context";
import { useMediaQuery } from "@/lib/use-media-query";
import { ConversationThread } from "@/app/(app)/inbox/[id]/conversation-thread";
import { setFichaCollapsedAction } from "@/app/(app)/inbox/ficha-actions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ANCHORED_QUERY = "(min-width: 1280px)";
const MODAL_QUERY = "(min-width: 768px)";

type Zone = "list" | "chat" | "ficha";
const FOCUSABLE_SELECTOR = "textarea, button, a, input, select";

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
  /** Whether the viewer owns this Conversation's own MessagingAccount — only they can send through it (PKG-014). */
  canReply: boolean;
  /** Set only when the Contact's reference delegate is someone other than the viewer (PKG-014, "acceso temporal"). */
  referenceDelegateName?: string;
  threadState: ConversationThreadState;
  supportsTyping: boolean;
  /** `"back"`: reached by soft navigation, `router.back()` restores the list's exact prior state. `"push"`: reached by a direct/hard load, so there is no prior in-app history entry to return to. */
  closeMode: "back" | "push";
  closeHref: string;
  /** "Ficha del afiliado" (UI-10a) — built by the page, which already has everything it needs resolved. */
  ficha: ReactNode;
  /** From the `kindly_ficha` cookie (`ficha-cookie.ts`) — only meaningful once anchored. */
  initialFichaCollapsed: boolean;
}

/**
 * The conversation panel (docs/ui/CHAT.md, docs/ui/CONVERSATION_WORKSPACE.md
 * UI-10a), one component reused from both routing entry points
 * (`@sheet/(.)[id]` on soft navigation, `[id]/page.tsx` on a direct load).
 * Picks its own chrome by viewport: anchored `aside` without an overlay on
 * `xl+` (chat and ficha as two columns, the ficha foldable), a modal `Sheet`
 * below that (chat/ficha as tabs, no room for two columns), full screen
 * under `md` — see `useMediaQuery`'s own note on why this needs JS rather
 * than a CSS breakpoint.
 */
export function ConversationSheet(props: ConversationSheetProps) {
  const {
    conversationId,
    contact,
    channel,
    delegateName,
    canReply,
    referenceDelegateName,
    threadState,
    supportsTyping,
    closeMode,
    closeHref,
    ficha,
    initialFichaCollapsed,
  } = props;
  const router = useRouter();
  const isAnchored = useMediaQuery(ANCHORED_QUERY);
  const isModalOrWider = useMediaQuery(MODAL_QUERY);
  const order = useInboxOrderList();
  const focusListRef = useInboxFocusList();
  const panelRef = useRef<HTMLDivElement>(null);
  const chatColumnRef = useRef<HTMLDivElement>(null);
  const fichaColumnRef = useRef<HTMLDivElement>(null);
  const [fichaCollapsed, setFichaCollapsed] = useState(initialFichaCollapsed);

  const toggleFicha = useCallback(() => {
    setFichaCollapsed((current) => {
      const next = !current;
      // Only has to be right by the next full load, same as the sidebar's
      // own toggle — the click already updated this render optimistically.
      void setFichaCollapsedAction(next);
      return next;
    });
  }, []);

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

  // `F6` cycles focus forward through the visible zones (`Ctrl+F6`
  // backward) — the anchored mode's stand-in for a focus trap it
  // deliberately does not have (docs/ui/ACCESSIBILITY.md §2). With the
  // ficha open (UI-10a) that's list → chat → ficha; collapsed or outside
  // anchored mode, just list → chat, same as before.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "F6") return;
      event.preventDefault();

      const zones: Zone[] = isAnchored && !fichaCollapsed ? ["list", "chat", "ficha"] : ["list", "chat"];
      const currentIndex = fichaColumnRef.current?.contains(document.activeElement)
        ? zones.indexOf("ficha")
        : chatColumnRef.current?.contains(document.activeElement)
          ? zones.indexOf("chat")
          : zones.indexOf("list");
      const delta = event.ctrlKey ? -1 : 1;
      const nextZone = zones[(currentIndex + delta + zones.length) % zones.length];

      if (nextZone === "list") {
        focusListRef.current?.();
      } else if (nextZone === "chat") {
        chatColumnRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      } else {
        fichaColumnRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focusListRef, isAnchored, fichaCollapsed]);

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
        {isAnchored && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={!fichaCollapsed}
            aria-label={fichaCollapsed ? "Mostrar ficha del afiliado" : "Plegar ficha del afiliado"}
            onClick={toggleFicha}
          >
            {fichaCollapsed ? <PanelRightOpen /> : <PanelRightClose />}
          </Button>
        )}
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

  // PKG-014 ("Delegado de referencia y acceso temporal", docs/DECISIONS.md):
  // shown whenever the Contact's reference delegate is someone other than
  // the viewer — including on the viewer's *own* Conversation with them,
  // which is exactly the scenario the rule describes ("Ana ve a Marta
  // resaltada... su delegado de referencia es Luis"). Stays with the chat,
  // not the ficha (docs/ui/CONVERSATION_WORKSPACE.md §7): "la ficha se
  // muestra completa" regardless of this notice.
  const referenceAlert = referenceDelegateName && (
    <div className="px-4 pt-3">
      <Alert tone="info" title={`Su delegado de referencia es ${referenceDelegateName}`}>
        Redirígele los mensajes cuando puedas. Si contestas, {contact.name} sabrá que le escribes tú, no{" "}
        {referenceDelegateName}.
      </Alert>
    </div>
  );

  const thread = (
    <ConversationThread
      conversationId={conversationId}
      initialState={threadState}
      supportsTyping={supportsTyping}
      canReply={canReply}
      ownerName={delegateName}
    />
  );

  if (isAnchored) {
    return (
      <aside
        ref={panelRef}
        aria-labelledby={titleId}
        // No Radix here to gate this on `data-state=open` (there is no
        // modal), so it just plays once on mount — matches the modal
        // Sheet's own entrance, which the user expects even anchored.
        // No fixed width on the outer element any more (UI-10a): its two
        // children below each carry their own, so the ficha folding away
        // shrinks the whole panel instead of leaving empty space.
        className="flex h-full shrink-0 border-l border-border bg-surface-200 animate-slide-in-right"
      >
        <div ref={chatColumnRef} className="flex h-full w-sheet-sm shrink-0 flex-col 2xl:w-sheet-md">
          {header}
          {referenceAlert}
          {thread}
        </div>
        {!fichaCollapsed && (
          <div
            ref={fichaColumnRef}
            role="complementary"
            aria-label="Ficha del afiliado"
            className="h-full w-workspace-context shrink-0 overflow-y-auto border-l border-border"
          >
            {ficha}
          </div>
        )}
      </aside>
    );
  }

  // Below `xl` there's no room for chat and ficha side by side
  // (docs/ui/CONVERSATION_WORKSPACE.md §2) — the ficha becomes a second tab
  // instead, switched locally without touching the URL.
  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" size={isModalOrWider ? "md" : "full"} showClose={false}>
        {header}
        {referenceAlert}
        <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="px-4">
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="ficha">Ficha</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col pt-0">
            {thread}
          </TabsContent>
          <TabsContent value="ficha" className="min-h-0 flex-1 overflow-y-auto pt-0">
            {ficha}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
