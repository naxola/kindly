"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, Send } from "lucide-react";
import { sendReplyAction, signalTypingAction } from "@/modules/conversations/actions";
import type { ConversationThreadState, ThreadMessage } from "@/modules/conversations/service";
import { TYPING_INDICATOR_THROTTLE_MS } from "@/modules/conversations/domain";
import { inboxKeys } from "@/app/(app)/inbox/inbox-queries";
import { DeliveryTicks, type DisplayStatus } from "@/app/(app)/inbox/[id]/delivery-ticks";
import { SheetBody, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CopilotCard } from "@/app/(app)/inbox/[id]/copilot-card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";

const POLL_INTERVAL_MS = 3_000;
const COMPOSER_MAX_ROWS = 6;
const NEAR_BOTTOM_PX = 80;

interface PendingMessage {
  tempId: string;
  body: string;
  createdAt: string;
  status: "SENDING" | "FAILED";
  error?: string;
}

const dayFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });
const timeFormatter = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(iso: string, todayKey: string, yesterdayKey: string): string {
  const key = dayKey(iso);
  if (key === todayKey) return "Hoy";
  if (key === yesterdayKey) return "Ayer";
  return dayFormatter.format(new Date(iso));
}

interface TimelineEntry {
  message: ThreadMessage;
  separator: string | null;
}

/**
 * Pairs each message with the day separator that goes before it, if any.
 * A plain function outside the component: the "last day seen so far"
 * running value it tracks while walking the list would otherwise be a
 * mutable variable reassigned during render (`react-hooks/immutability`).
 */
function buildTimeline(messages: ThreadMessage[], todayKey: string, yesterdayKey: string): TimelineEntry[] {
  let lastDay = "";
  return messages.map((message) => {
    const day = dayKey(message.createdAt);
    const separator = day !== lastDay ? dayLabel(message.createdAt, todayKey, yesterdayKey) : null;
    lastDay = day;
    return { message, separator };
  });
}

/**
 * The live part of a conversation (PKG-013 logic, docs/ui/CHAT.md §2-3):
 * history with day separators, composer, delivery ticks, "escribiendo…".
 *
 * - Sending is optimistic: the message appears at once with a clock, the
 *   textarea empties, and the real send happens behind it.
 * - Polls every few seconds while the tab is visible for new inbound
 *   messages and ✓✓ updates.
 * - If the reader has scrolled up, a new message does not yank them to the
 *   bottom — it surfaces a "Mensajes nuevos ↓" banner instead.
 * - The draft survives closing the panel (`sessionStorage`, keyed by
 *   conversation) — closing never discards it, so no confirmation is asked.
 */
export function ConversationThread({
  conversationId,
  initialState,
  supportsTyping,
  canReply,
  ownerName,
}: {
  conversationId: string;
  initialState: ConversationThreadState;
  supportsTyping: boolean;
  /** Whether the viewer owns this Conversation's MessagingAccount (PKG-014) — false hides the composer entirely. */
  canReply: boolean;
  /** The delegate whose number this Conversation actually is, shown when `canReply` is false. */
  ownerName: string;
}) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ThreadMessage[]>(initialState.messages);
  const [serviceWindow, setServiceWindow] = useState(initialState.serviceWindow);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [text, setText] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const lastTypingSentAt = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasReadDraftRef = useRef(false);
  const draftKey = `inbox:draft:${conversationId}`;

  // Skip the live-region announcement for the initial history: only new
  // arrivals from here on are worth interrupting a screen reader for.
  useEffect(() => {
    const timer = setTimeout(() => setIsLive(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const draft = sessionStorage.getItem(draftKey);
    // Deferred a tick, same as the `isLive` effect above: reading storage
    // is inherently a post-mount concern (there is none during SSR), and
    // this keeps it off the synchronous "setState in an effect" pattern.
    const timer = setTimeout(() => {
      if (draft) {
        setText(draft);
      }
      // Only now does the write-effect below start touching storage — set
      // synchronously, before `setText` schedules its own render, so that
      // effect's next run (still with the pre-hydration empty `text`,
      // React Strict Mode's remount runs this whole effect twice) does not
      // see it as "cleared" and delete what we just read (real bug, caught
      // against a dev server: the mount's own first pass wiped the draft
      // before its second pass ever read it).
      hasReadDraftRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
    // Only on mount, for this conversation's own key — draftKey is stable per instance (conversationId is the React key upstream).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasReadDraftRef.current) {
      return;
    }
    if (text) {
      sessionStorage.setItem(draftKey, text);
    } else {
      sessionStorage.removeItem(draftKey);
    }
  }, [text, draftKey]);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }, []);

  // Scrolls only the history's own container — never `scrollIntoView`,
  // which also scrolls every scrollable ancestor to reveal the element:
  // mid-way through the panel's opening transition that shifted the panel
  // (and for a frame the whole page) sideways, leaving it misaligned.
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior });
    setHasNewMessages(false);
  }, []);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/thread`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      return;
    }
    const state = (await response.json()) as ConversationThreadState;
    const grew = state.messages.length > messages.length;
    const stayAtBottom = isNearBottom();
    setMessages(state.messages);
    setServiceWindow(state.serviceWindow);
    if (grew && !stayAtBottom) {
      setHasNewMessages(true);
    }
    // messages.length read for the growth check, not a reactive dependency
    // (would re-subscribe the interval on every message): the interval
    // closure always calls the latest `refresh` since it is re-created each
    // render and the effect below re-registers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, isNearBottom]);

  useEffect(() => {
    // At once, not only on the first tick: the initial state may come from
    // a hover prefetch seconds old, and this request is also what marks the
    // conversation read now that it is actually open (the prefetch never does).
    // Deferred a tick, same as the draft read above (`set-state-in-effect`).
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, POLL_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const itemCount = messages.length + pending.length;
  const wasAtBottomRef = useRef(true);
  useEffect(() => {
    if (wasAtBottomRef.current) {
      scrollToBottom(pending.length > 0 ? "smooth" : "auto");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount]);

  function handleScroll() {
    wasAtBottomRef.current = isNearBottom();
    if (wasAtBottomRef.current) {
      setHasNewMessages(false);
    }
  }

  async function deliver(item: PendingMessage) {
    const result = await sendReplyAction(conversationId, item.body);
    if (result.ok) {
      // The list shows each conversation's last message: refresh it now
      // rather than on its next background tick.
      void queryClient.invalidateQueries({ queryKey: inboxKeys.lists() });
      setPending((current) => current.filter((p) => p.tempId !== item.tempId));
      setMessages((current) =>
        current.some((m) => m.id === result.message.id) ? current : [...current, result.message],
      );
    } else {
      setPending((current) =>
        current.map((p) => (p.tempId === item.tempId ? { ...p, status: "FAILED", error: result.error } : p)),
      );
    }
  }

  function handleSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body) {
      return;
    }
    const item: PendingMessage = {
      tempId: crypto.randomUUID(),
      body,
      createdAt: new Date().toISOString(),
      status: "SENDING",
    };
    setText("");
    wasAtBottomRef.current = true;
    setPending((current) => [...current, item]);
    void deliver(item);
  }

  function retry(item: PendingMessage) {
    const again = { ...item, status: "SENDING" as const, error: undefined };
    setPending((current) => current.map((p) => (p.tempId === item.tempId ? again : p)));
    void deliver(again);
  }

  function resizeComposer() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20");
      el.style.height = `${Math.min(el.scrollHeight, lineHeight * COMPOSER_MAX_ROWS)}px`;
    }
  }

  /**
   * The Copilot's "Usar como borrador": fills the composer and focuses it —
   * nothing is sent and no typing indicator is signalled (the professional
   * has not typed anything). They edit and press Send themselves.
   */
  function applyCopilotDraft(value: string) {
    setText(value);
    requestAnimationFrame(() => {
      resizeComposer();
      textareaRef.current?.focus();
    });
  }

  function handleChange(value: string) {
    setText(value);
    resizeComposer();
    const now = Date.now();
    if (supportsTyping && value.trim() && now - lastTypingSentAt.current > TYPING_INDICATOR_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      void signalTypingAction(conversationId).catch(() => {});
    }
  }

  const expiresAt = serviceWindow.expiresAt ? new Date(serviceWindow.expiresAt) : null;
  const now = new Date();
  const todayKey = dayKey(now.toISOString());
  const yesterdayKey = dayKey(new Date(now.getTime() - 86_400_000).toISOString());
  const timeline = buildTimeline(messages, todayKey, yesterdayKey);
  const latestInboundId = [...messages].reverse().find((m) => m.direction === "INBOUND")?.id ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* `flex flex-col`: without a flex parent, `flex-1` on SheetBody below
          does nothing (flex properties only apply to flex *items*), so it
          sized itself to its content instead of the space actually
          available — the history then visually overflowed past this
          wrapper's box straight onto the footer below it (real bug, found
          verifying a closed service window with several messages). */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <SheetBody ref={scrollRef} onScroll={handleScroll} className="flex flex-col gap-1">
          {/* `role="log"` (a live-region role) can't sit on the `<ul>`
              itself: it overrides the element's implicit list role, which
              in turn strips the `<li>` children of their implicit listitem
              role — axe's "listitem"/"aria-required-parent" rules both
              catch it (a listitem needs a real list ancestor). The `log`
              role moves to this wrapping `<div>` instead; the `<ul>` below
              stays a plain, valid list (`className="contents"` so it adds
              no extra box to the flex layout the div already provides). */}
          <div role="log" aria-live={isLive ? "polite" : "off"} aria-label="Mensajes" className="flex flex-col gap-1">
            <ul className="contents">
              {itemCount === 0 && (
                <li>
                  <EmptyState variant="inline" title="Todavía no hay mensajes." />
                </li>
              )}
              {timeline.flatMap(({ message, separator }) => {
                const nodes = [
                  <li key={message.id}>
                    <Bubble
                      direction={message.direction}
                      body={message.body}
                      createdAt={message.createdAt}
                      status={message.deliveryStatus}
                      sentFromDevice={message.sentFromDevice}
                    />
                  </li>,
                ];
                if (separator) {
                  nodes.unshift(
                    <li key={`${message.id}-day`}>
                      <DaySeparator label={separator} />
                    </li>,
                  );
                }
                return nodes;
              })}
              {pending.map((item) => (
                <li key={item.tempId}>
                  <Bubble
                    direction="OUTBOUND"
                    body={item.body}
                    createdAt={item.createdAt}
                    status={item.status}
                    sentFromDevice={false}
                    error={item.error}
                    onRetry={item.status === "FAILED" ? () => retry(item) : undefined}
                  />
                </li>
              ))}
            </ul>
          </div>
        </SheetBody>
        {hasNewMessages && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              icon={<ArrowDown className="size-3.5" />}
              className="pointer-events-auto bg-surface-200 shadow-md"
              onClick={() => scrollToBottom()}
            >
              Mensajes nuevos
            </Button>
          </div>
        )}
      </div>

      {canReply && (
        <CopilotCard
          conversationId={conversationId}
          latestInboundId={latestInboundId}
          composerAvailable={serviceWindow.status !== "CLOSED"}
          composerUnavailableReason="La ventana de respuesta libre está cerrada: no puedes responder en texto libre ahora mismo."
          hasDraftText={text.trim() !== ""}
          onUseAsDraft={applyCopilotDraft}
        />
      )}

      <SheetFooter className="flex-col items-stretch">
        {!canReply ? (
          <Alert tone="neutral" title="Solo lectura">
            Esta conversación es del número de {ownerName}. Para responder, hazlo desde la conversación de este
            contacto en tu propio número.
          </Alert>
        ) : serviceWindow.status === "CLOSED" ? (
          <Alert tone="warning" title="No puedes responder en texto libre ahora mismo">
            <p>
              El proveedor solo permite respuestas libres durante un tiempo limitado desde el último mensaje del
              contacto. Esa ventana está cerrada
              {expiresAt ? ` desde el ${expiresAt.toLocaleString("es-ES")}` : " porque el contacto todavía no ha escrito"}.
            </p>
            <p>
              Los mensajes que el delegado envía desde su propio móvil <strong>no reabren</strong> esta ventana: solo
              la reabre un mensaje nuevo del contacto. Hasta entonces, la única vía son las plantillas aprobadas, que
              todavía no están disponibles en Kindly.
            </p>
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
            {serviceWindow.status === "OPEN" && expiresAt && (
              <p className="type-caption text-foreground-lighter">
                Ventana de respuesta libre abierta hasta el {expiresAt.toLocaleString("es-ES")}.
              </p>
            )}
            <textarea
              ref={textareaRef}
              className={cn(
                "min-h-control-lg w-full resize-none rounded-control border border-border-control bg-control px-2.5 py-2 type-body text-foreground",
                "placeholder:text-foreground-lighter focus-ring focus-visible:border-ring",
              )}
              name="text"
              placeholder="Escribe una respuesta..."
              rows={1}
              value={text}
              onChange={(event) => handleChange(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line — as in WhatsApp Web.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="type-caption text-foreground-lighter">Intro para enviar · Mayús+Intro salto de línea</p>
              <Button type="submit" size="sm" disabled={!text.trim()} icon={<Send className="size-4" />}>
                Enviar
              </Button>
            </div>
          </form>
        )}
      </SheetFooter>
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div role="separator" className="my-2 flex items-center gap-2 type-caption text-foreground-lighter">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Bubble({
  direction,
  body,
  createdAt,
  status,
  sentFromDevice,
  error,
  onRetry,
}: {
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  createdAt: string;
  status: DisplayStatus;
  sentFromDevice: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const outbound = direction === "OUTBOUND";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-bubble px-3 py-2 type-body",
          outbound ? "bg-bubble-outbound text-bubble-outbound-foreground border border-bubble-outbound-border" : "bg-bubble-inbound text-bubble-inbound-foreground",
          status === "SENDING" && "opacity-80",
        )}
      >
        <p className="whitespace-pre-wrap">{body}</p>
        <p className="mt-1 flex items-center justify-end gap-1 type-caption text-foreground-lighter">
          <span>{timeFormatter.format(new Date(createdAt))}</span>
          {/* Coexistence: an outbound message may have been written on the delegate's own phone (PKG-005). */}
          {outbound && sentFromDevice && <span>· desde el móvil</span>}
          {outbound && <DeliveryTicks status={status} />}
        </p>
        {error && (
          <p role="alert" className="mt-1 type-caption text-destructive">
            No enviado: {error}{" "}
            {onRetry && (
              <button type="button" onClick={onRetry} className="underline">
                Reintentar
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
