/**
 * Per-channel `MessagingAdapter` registry. Empty in production until a real
 * provider ships (Fase 4/5 — TelegramAdapter/WhatsAppAdapter). Tests
 * register a fake adapter here to exercise the full pipeline without a real
 * provider; nothing outside the test suite ever registers a fake channel,
 * so it's unreachable from a real request.
 *
 * Backed by `globalThis`, not a plain module-scope `Map` (found while
 * building PKG-004's `src/instrumentation.ts`): Turbopack's production
 * output for `next start` gives `instrumentation.ts` and a route/page a
 * *separate* instantiation of this module, each with its own `Map` — a
 * module-scope singleton registered from one is invisible from the other.
 * `globalThis` is the one thing every chunk in the same Node process
 * actually shares. See docs/DECISIONS.md, bloque "PKG-004".
 */
import type { MessagingAdapter, MessagingChannelCapabilities } from "@/modules/messaging/adapter";

declare global {
  var __kindlyMessagingAdapters: Map<string, MessagingAdapter> | undefined;
}

function getRegistry(): Map<string, MessagingAdapter> {
  globalThis.__kindlyMessagingAdapters ??= new Map();
  return globalThis.__kindlyMessagingAdapters;
}

export function registerMessagingAdapter(adapter: MessagingAdapter): void {
  getRegistry().set(adapter.channel, adapter);
}

export function getMessagingAdapter(channel: string): MessagingAdapter | null {
  return getRegistry().get(channel) ?? null;
}

/** Channels with a real registered adapter — drives the "connect a channel" UI (PKG-004). Empty in production. */
export function listRegisteredChannels(): string[] {
  return [...getRegistry().keys()];
}

/**
 * Capabilities of a channel, or null when no adapter is registered for it.
 * Lets the UI ask what a channel can do without importing the adapter
 * itself or branching on a provider name (PKG-005).
 */
export function getChannelCapabilities(channel: string): MessagingChannelCapabilities | null {
  return getMessagingAdapter(channel)?.capabilities ?? null;
}

export function clearMessagingAdapters(): void {
  getRegistry().clear();
}
