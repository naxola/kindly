"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendReplyAction, signalTypingAction } from "@/modules/conversations/actions";
import type { ConversationThreadState, ThreadMessage } from "@/modules/conversations/service";
import { TYPING_INDICATOR_THROTTLE_MS } from "@/modules/conversations/domain";
import { DeliveryTicks, type DisplayStatus } from "@/app/(app)/inbox/[id]/delivery-ticks";

const POLL_INTERVAL_MS = 3_000;

interface PendingMessage {
  tempId: string;
  body: string;
  createdAt: string;
  status: "SENDING" | "FAILED";
  error?: string;
}

/**
 * The live part of a conversation (PKG-013): messages, delivery ticks and
 * the composer.
 *
 * - Sending is optimistic: the message appears at once with a clock, the
 *   textarea empties, and the real send happens behind it. Before this the
 *   page stayed still until the provider answered, and a user who saw
 *   nothing happen sent the same message several times.
 * - The thread polls every few seconds while the tab is visible, which is
 *   how new inbound messages and ✓✓ updates arrive without reloading.
 * - Typing sends "typing…" to the Contact, at most once per throttle window.
 */
export function ConversationThread({
  conversationId,
  initialState,
  supportsTyping,
}: {
  conversationId: string;
  initialState: ConversationThreadState;
  supportsTyping: boolean;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialState.messages);
  const [serviceWindow, setServiceWindow] = useState(initialState.serviceWindow);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [text, setText] = useState("");
  const lastTypingSentAt = useRef(0);
  const bottomRef = useRef<HTMLLIElement>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/thread`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      return;
    }
    const state = (await response.json()) as ConversationThreadState;
    setMessages(state.messages);
    setServiceWindow(state.serviceWindow);
  }, [conversationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, POLL_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const itemCount = messages.length + pending.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [itemCount]);

  async function deliver(item: PendingMessage) {
    const result = await sendReplyAction(conversationId, item.body);
    if (result.ok) {
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
    setPending((current) => [...current, item]);
    void deliver(item);
  }

  function retry(item: PendingMessage) {
    const again = { ...item, status: "SENDING" as const, error: undefined };
    setPending((current) => current.map((p) => (p.tempId === item.tempId ? again : p)));
    void deliver(again);
  }

  function handleChange(value: string) {
    setText(value);
    const now = Date.now();
    if (supportsTyping && value.trim() && now - lastTypingSentAt.current > TYPING_INDICATOR_THROTTLE_MS) {
      lastTypingSentAt.current = now;
      void signalTypingAction(conversationId).catch(() => {});
    }
  }

  const expiresAt = serviceWindow.expiresAt ? new Date(serviceWindow.expiresAt) : null;

  return (
    <>
      <ul className="flex flex-col gap-2" aria-label="Mensajes">
        {messages.map((message) => (
          <Bubble
            key={message.id}
            direction={message.direction}
            body={message.body}
            createdAt={message.createdAt}
            status={message.deliveryStatus}
            sentFromDevice={message.sentFromDevice}
          />
        ))}
        {pending.map((item) => (
          <Bubble
            key={item.tempId}
            direction="OUTBOUND"
            body={item.body}
            createdAt={item.createdAt}
            status={item.status}
            sentFromDevice={false}
            error={item.error}
            onRetry={item.status === "FAILED" ? () => retry(item) : undefined}
          />
        ))}
        {itemCount === 0 && <li className="py-4 text-center text-sm text-zinc-400">Sin mensajes todavía.</li>}
        <li ref={bottomRef} aria-hidden />
      </ul>

      {serviceWindow.status === "CLOSED" ? (
        <div className="flex flex-col gap-1 rounded border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">No puedes responder en texto libre ahora mismo</p>
          <p className="text-amber-800">
            El proveedor solo permite respuestas libres durante un tiempo limitado desde el último mensaje del
            contacto. Esa ventana está cerrada
            {expiresAt ? ` desde el ${expiresAt.toLocaleString("es-ES")}` : " porque el contacto todavía no ha escrito"}.
          </p>
          <p className="text-amber-800">
            Los mensajes que el delegado envía desde su propio móvil <strong>no reabren</strong> esta ventana: solo
            la reabre un mensaje nuevo del contacto. Hasta entonces, la única vía son las plantillas aprobadas, que
            todavía no están disponibles en Kindly.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded border border-zinc-200 p-3">
          {serviceWindow.status === "OPEN" && expiresAt && (
            <p className="text-xs text-zinc-500">
              Ventana de respuesta libre abierta hasta el {expiresAt.toLocaleString("es-ES")}.
            </p>
          )}
          <textarea
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            name="text"
            placeholder="Escribe una respuesta..."
            rows={3}
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
            <p className="text-xs text-zinc-400">Intro para enviar · Mayús+Intro para salto de línea</p>
            <button
              type="submit"
              disabled={!text.trim()}
              className="w-fit rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Enviar
            </button>
          </div>
        </form>
      )}
    </>
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
    <li className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-md rounded px-3 py-2 text-sm ${
          outbound ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-900"
        } ${status === "SENDING" ? "opacity-80" : ""}`}
      >
        <p className="whitespace-pre-wrap">{body}</p>
        <p className={`mt-1 flex items-center justify-end gap-1 text-xs ${outbound ? "text-zinc-300" : "text-zinc-400"}`}>
          <span>{new Date(createdAt).toLocaleString("es-ES")}</span>
          {/* Coexistence: an outbound message may have been written on the delegate's own phone (PKG-005). */}
          {outbound && sentFromDevice && <span>· desde el móvil</span>}
          {outbound && <DeliveryTicks status={status} />}
        </p>
        {error && (
          <p className="mt-1 text-xs text-red-300">
            No enviado: {error}{" "}
            {onRetry && (
              <button type="button" onClick={onRetry} className="underline">
                Reintentar
              </button>
            )}
          </p>
        )}
      </div>
    </li>
  );
}
