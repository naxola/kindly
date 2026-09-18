/**
 * Per-channel `MessagingAdapter` registry. Empty in production until a real
 * provider ships (Fase 4/5 — TelegramAdapter/WhatsAppAdapter). Tests
 * register a fake adapter here to exercise the full pipeline without a real
 * provider; nothing outside the test suite ever registers a fake channel,
 * so it's unreachable from a real request.
 */
import type { MessagingAdapter } from "@/modules/messaging/adapter";

const adapters = new Map<string, MessagingAdapter>();

export function registerMessagingAdapter(adapter: MessagingAdapter): void {
  adapters.set(adapter.channel, adapter);
}

export function getMessagingAdapter(channel: string): MessagingAdapter | null {
  return adapters.get(channel) ?? null;
}

export function clearMessagingAdapters(): void {
  adapters.clear();
}
