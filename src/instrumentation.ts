/**
 * Registers the "fake" MessagingAdapter in a real running server — but only
 * when `E2E_FAKE_MESSAGING_CHANNEL=true`. The only place that ever sets
 * that variable is `playwright.config.ts`'s `webServer.env`, so Playwright
 * can exercise the full `Webhook → Conversation → Inbox` flow against a
 * real production build (`next build && next start`) without a real
 * provider. It is never part of `.env.example` or any deployment config —
 * absent everywhere else, this registers nothing, same as today.
 * See docs/DECISIONS.md, bloque "PKG-004", for the full rationale.
 */
export async function register() {
  // The fake adapter uses `node:crypto`, unsupported in the Edge runtime —
  // this route only ever needs to run once, in the Node runtime that
  // actually serves `/api/webhooks/*` (see "Specifying the runtime" in
  // Next.js instrumentation docs).
  if (process.env.NEXT_RUNTIME === "edge" || process.env.E2E_FAKE_MESSAGING_CHANNEL !== "true") {
    return;
  }

  const { registerMessagingAdapter } = await import("@/modules/messaging/registry");
  const { FakeMessagingAdapter } = await import("@/modules/messaging/testing/fake-adapter");
  registerMessagingAdapter(new FakeMessagingAdapter());
  // A second fake shaped like WhatsApp coexistence (PKG-005): a 24h
  // free-form window and a connection Kindly cannot end from its side, so
  // the E2E suite can exercise the UI those two facts produce.
  registerMessagingAdapter(
    new FakeMessagingAdapter("fake-shared-secret", {
      channel: "fake-coex",
      serviceWindowHours: 24,
      canDisconnect: false,
      onboarding: "WHATSAPP_COEXISTENCE",
    }),
  );
}
