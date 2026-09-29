"use client";

import { useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, MessageCircle, MoreHorizontal, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import type { ConversationWorkspaceData } from "@/app/(app)/inbox/conversation-workspace-types";
import { useInboxFocusList, useInboxOrderList } from "@/app/(app)/inbox/inbox-order-context";
import { useHydrated, useMediaQuery } from "@/lib/use-media-query";
import { ConversationThread } from "@/app/(app)/inbox/[id]/conversation-thread";
import { ContactFicha } from "@/app/(app)/inbox/[id]/contact-ficha";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, Skeleton } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";

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

export interface ConversationPanelProps {
  /** Whether a conversation is open — drives the open/close animation. */
  open: boolean;
  /** The conversation shown: the open one, or the one just closed while it animates out. */
  conversationId: string | null;
  /** `undefined` while it is still loading — the panel opens at once anyway, with a skeleton. */
  data: ConversationWorkspaceData | undefined;
  notFound: boolean;
  fichaCollapsed: boolean;
  onToggleFicha: () => void;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
  onMutated: () => void;
}

/**
 * The conversation panel (docs/ui/CHAT.md, docs/ui/CONVERSATION_WORKSPACE.md):
 * chat + ficha next to the Inbox list. Always mounted — `InboxWorkspace`
 * only tells it what to show — so opening, closing, switching conversation
 * and folding the ficha are all the same element changing width (a real,
 * two-way CSS transition the list follows frame by frame as a `flex-1`
 * sibling), never a route mounting or unmounting it.
 *
 * Chrome by viewport: anchored `aside` without an overlay on `xl+` (chat and
 * ficha as two columns), a modal `Sheet` below that (chat/ficha as tabs),
 * full screen under `md`.
 */
export function ConversationPanel(props: ConversationPanelProps) {
  const { open, conversationId, data, notFound, fichaCollapsed, onToggleFicha, onClose, onOpenConversation, onMutated } =
    props;
  const hydrated = useHydrated();
  const isAnchored = useMediaQuery(ANCHORED_QUERY);
  const isModalOrWider = useMediaQuery(MODAL_QUERY);
  const order = useInboxOrderList();
  const focusListRef = useInboxFocusList();
  const panelRef = useRef<HTMLElement>(null);
  const chatColumnRef = useRef<HTMLDivElement>(null);
  const fichaColumnRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Before hydration `useMediaQuery` can't know the viewport: render the
  // anchored shell with CSS deciding its visibility (`hidden xl:block`),
  // so a direct load of `/inbox/<id>` paints the panel at its final width
  // straight away — never a modal first, never the list at full width.
  const mode: "ssr" | "anchored" | "sheet" = !hydrated ? "ssr" : isAnchored ? "anchored" : "sheet";

  const { previousId, nextId } = useMemo(() => {
    const index = conversationId ? order.indexOf(conversationId) : -1;
    return {
      previousId: index > 0 ? order[index - 1] : null,
      nextId: index >= 0 && index < order.length - 1 ? order[index + 1] : null,
    };
  }, [conversationId, order]);

  // The panel goes inert as it closes; hand focus back to the list instead
  // of letting it fall to <body>.
  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) {
      focusListRef.current?.();
    }
    onClose();
  }, [focusListRef, onClose]);

  // The anchored panel is not a Dialog, so `Esc` needs its own listener —
  // only while focus is inside it, matching the modal Sheet's own Esc.
  useEffect(() => {
    if (!open || mode !== "anchored") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && panelRef.current?.contains(document.activeElement)) {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, mode, close]);

  // `F6` cycles focus forward through the visible zones (`Ctrl+F6`
  // backward) — the anchored mode's stand-in for a focus trap it
  // deliberately does not have (docs/ui/ACCESSIBILITY.md §2): list → chat →
  // ficha, or list → chat with the ficha folded.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "F6") return;
      event.preventDefault();
      const zones: Zone[] = mode === "anchored" && !fichaCollapsed ? ["list", "chat", "ficha"] : ["list", "chat"];
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
  }, [open, mode, fichaCollapsed, focusListRef]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey) return;
      if (event.key === "ArrowDown" && nextId) {
        event.preventDefault();
        onOpenConversation(nextId);
      } else if (event.key === "ArrowUp" && previousId) {
        event.preventDefault();
        onOpenConversation(previousId);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, nextId, previousId, onOpenConversation]);

  const anchored = mode !== "sheet";

  const header = data ? (
    <SheetHeader className="flex-row items-start justify-between gap-2 space-y-0">
      <div className="flex min-w-0 items-start gap-2.5">
        <Avatar name={data.contact.name} badge={<MessageCircle aria-label={data.channel} className="size-2.5" />} />
        <div className="min-w-0">
          <PanelTitle anchored={anchored} id={titleId}>
            <Link href={`/contacts/${data.contact.id}`} className="hover:underline">
              {data.contact.name}
            </Link>
          </PanelTitle>
          <PanelDescription anchored={anchored}>
            {data.channel} · Delegado: {data.delegateName}
          </PanelDescription>
          {data.contact.isUnassigned && (
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
          onClick={() => previousId && onOpenConversation(previousId)}
          aria-label="Conversación anterior"
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!nextId}
          disabledReason={nextId ? undefined : "No hay conversación siguiente en esta lista"}
          onClick={() => nextId && onOpenConversation(nextId)}
          aria-label="Conversación siguiente"
        >
          <ChevronDown />
        </Button>
        {anchored && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={!fichaCollapsed}
            aria-label={fichaCollapsed ? "Mostrar ficha del afiliado" : "Plegar ficha del afiliado"}
            onClick={onToggleFicha}
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
              <Link href={`/contacts/${data.contact.id}`}>Ver contacto</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={close}
          aria-label={anchored || isModalOrWider ? "Cerrar conversación" : "Volver a la bandeja"}
        >
          {anchored || isModalOrWider ? <X /> : <ArrowLeft />}
        </Button>
      </div>
    </SheetHeader>
  ) : (
    <SheetHeader className="flex-row items-center justify-between gap-2 space-y-0">
      <div aria-busy className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="sr-only">Cargando conversación</span>
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Cerrar conversación">
        <X />
      </Button>
    </SheetHeader>
  );

  // PKG-014 ("Delegado de referencia y acceso temporal", docs/DECISIONS.md):
  // shown whenever the Contact's reference delegate is someone other than
  // the viewer — including on the viewer's *own* Conversation with them.
  // Stays with the chat, not the ficha (docs/ui/CONVERSATION_WORKSPACE.md §7).
  const referenceAlert = data?.referenceDelegateName && (
    <div className="px-4 pt-3">
      <Alert tone="info" title={`Su delegado de referencia es ${data.referenceDelegateName}`}>
        Redirígele los mensajes cuando puedas. Si contestas, {data.contact.name} sabrá que le escribes tú, no{" "}
        {data.referenceDelegateName}.
      </Alert>
    </div>
  );

  const chatBody = notFound ? (
    <EmptyState title="Esta conversación no existe o no tienes acceso" />
  ) : data ? (
    <ConversationThread
      key={data.conversationId}
      conversationId={data.conversationId}
      initialState={data.threadState}
      supportsTyping={data.supportsTyping}
      canReply={data.canReply}
      ownerName={data.delegateName}
    />
  ) : (
    <div className="flex flex-1 flex-col justify-end gap-2 px-4 py-4">
      <Skeleton className="h-10 w-2/3 rounded-bubble" />
      <Skeleton className="ml-auto h-10 w-1/2 rounded-bubble" />
      <Skeleton className="h-10 w-1/2 rounded-bubble" />
    </div>
  );

  const fichaBody = data ? (
    <ContactFicha data={data} onOpenConversation={onOpenConversation} onMutated={onMutated} />
  ) : notFound ? null : (
    <div aria-hidden className="flex flex-col gap-3 px-4 py-4">
      <Skeleton className="h-3.5 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );

  if (mode === "sheet") {
    // Below `xl` there's no room for chat and ficha side by side
    // (docs/ui/CONVERSATION_WORKSPACE.md §2) — the ficha is a second tab.
    // Radix keeps the content mounted through its own exit animation.
    return (
      <Sheet open={open} onOpenChange={(next) => !next && close()}>
        <SheetContent side="right" size={isModalOrWider ? "md" : "full"} showClose={false}>
          {conversationId && (
            <>
              {header}
              {referenceAlert}
              <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="px-4">
                  <TabsTrigger value="chat">Chat</TabsTrigger>
                  <TabsTrigger value="ficha">Ficha</TabsTrigger>
                </TabsList>
                <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col pt-0">
                  {chatBody}
                </TabsContent>
                <TabsContent value="ficha" className="min-h-0 flex-1 overflow-y-auto pt-0">
                  {fichaBody}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      ref={panelRef}
      data-conversation-panel
      aria-labelledby={data ? titleId : undefined}
      aria-label={data ? undefined : "Conversación"}
      aria-hidden={!open}
      inert={!open}
      // One element, one width, three states (closed / chat only / chat +
      // ficha): every change between them — opening, closing, folding the
      // ficha — is the same two-way `width` transition, and the list next
      // to it (`flex-1`) follows it frame by frame with no code of its own.
      // `overflow-hidden` + fixed-width columns inside: the columns never
      // squeeze, they slide in and out past the panel's edge.
      className={cn(
        "h-full shrink-0 overflow-hidden transition-[width] duration-(--duration-slow) ease-emphasized motion-reduce:transition-none",
        mode === "ssr" && "hidden xl:block",
        !open
          ? "w-0"
          : fichaCollapsed
            ? "w-sheet-sm 2xl:w-sheet-md"
            : "w-[calc(var(--sheet-w-sm)+var(--workspace-context-w))] 2xl:w-[calc(var(--sheet-w-md)+var(--workspace-context-w))]",
      )}
    >
      <div className="flex h-full">
        <div
          ref={chatColumnRef}
          className="flex h-full w-sheet-sm shrink-0 flex-col border-l border-border bg-surface-200 2xl:w-sheet-md"
        >
          {/* Content only after hydration: its dates and times format in
              the browser's own time zone, which a server render can't match. */}
          {hydrated && conversationId && (
            <>
              {header}
              {referenceAlert}
              {chatBody}
            </>
          )}
        </div>
        <div
          ref={fichaColumnRef}
          role="complementary"
          aria-label="Ficha del afiliado"
          aria-hidden={fichaCollapsed}
          inert={fichaCollapsed}
          className="h-full w-workspace-context shrink-0 overflow-y-auto border-l border-border bg-surface-200"
        >
          {hydrated && conversationId && fichaBody}
        </div>
      </div>
    </aside>
  );
}
