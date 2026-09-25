/**
 * Registers the "fake" MessagingAdapter in a real running server — but only
 * when `E2E_FAKE_MESSAGING_CHANNEL=true`. The only place that ever sets
 * that variable is `playwright.config.ts`'s `webServer.env`, so Playwright
 * can exercise the full `Webhook → Conversation → Inbox` flow against a
 * real production build (`next build && next start`) without a real
 * provider. It is never part of `.env.example` or any deployment config —
 * absent everywhere else, this registers nothing, same as today.
 * See docs/DECISIONS.md, bloque "PKG-004", for the full rationale.
 *
 * Also registers PKG-011's WhatsApp test adapter, under its own opt-in
 * (see `registerWhatsAppTestAdapter` below).
 */
export async function register() {
  // The fake adapter uses `node:crypto`, unsupported in the Edge runtime —
  // this route only ever needs to run once, in the Node runtime that
  // actually serves `/api/webhooks/*` (see "Specifying the runtime" in
  // Next.js instrumentation docs).
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  await registerWhatsAppTestAdapter();

  if (process.env.E2E_FAKE_MESSAGING_CHANNEL !== "true") {
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

/**
 * PKG-011: WhatsApp Cloud API against Meta's test number, for validating
 * the real pipeline on staging. Needs the explicit flag *and* every
 * credential — the credentials alone never enable it, so copying staging's
 * variables into another environment by mistake isn't enough — and it
 * refuses Vercel Production outright. See docs/DECISIONS.md.
 */
async function registerWhatsAppTestAdapter() {
  // Checked here too, not only in `register()`: with the check only at the
  // caller, the bundler still sees this function's import and pulls
  // `node:crypto` into the Edge instrumentation bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.WHATSAPP_TEST_ADAPTER_ENABLED !== "true") {
    return;
  }
  if (process.env.VERCEL_ENV === "production") {
    console.warn("[whatsapp-test] WHATSAPP_TEST_ADAPTER_ENABLED is ignored in Vercel Production.");
    return;
  }

  const phoneNumberId = process.env.WHATSAPP_TEST_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TEST_ACCESS_TOKEN;
  const appSecret = process.env.WHATSAPP_TEST_APP_SECRET;
  const verifyToken = process.env.WHATSAPP_TEST_VERIFY_TOKEN;
  if (!phoneNumberId || !accessToken || !appSecret || !verifyToken) {
    console.warn("[whatsapp-test] enabled but credentials are incomplete; adapter not registered.");
    return;
  }

  const { registerMessagingAdapter } = await import("@/modules/messaging/registry");
  const { WhatsAppTestAdapter } = await import("@/modules/messaging/testing/whatsapp-test-adapter");
  registerMessagingAdapter(
    new WhatsAppTestAdapter({
      phoneNumberId,
      wabaId: process.env.WHATSAPP_TEST_WABA_ID || null,
      accessToken,
      appSecret,
      verifyToken,
    }),
  );
}
