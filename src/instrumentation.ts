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
 * (see `registerWhatsAppTestAdapter` below), and Fase 7b's real
 * `EmbeddingProvider` (see `registerOpenAIEmbeddingProvider` below).
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
  await registerOpenAIEmbeddingProvider();
  await registerOpenAILLMProvider();
  await registerGeminiProviders();
  await registerFakeEmbeddingProviderForE2E();
  await registerFakeLLMProviderForE2E();

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

/**
 * Fase 7b: the real `EmbeddingProvider` (OpenAI `text-embedding-3-small`),
 * registered only when `OPENAI_API_KEY` is set. Absent everywhere else
 * (local dev without a key, CI), `getEmbeddingProvider()` keeps throwing as
 * it did before this package — no silent fallback to the deterministic
 * fake, which must never produce real search results (`CLAUDE.md` §3).
 */
async function registerOpenAIEmbeddingProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || activeAIProvider() !== "openai") {
    return;
  }

  const { registerEmbeddingProvider } = await import("@/modules/knowledge/embedding-provider");
  const { OpenAIEmbeddingProvider } = await import("@/modules/knowledge/openai-embedding-provider");
  // `OPENAI_EMBEDDING_MODEL` must produce `EMBEDDING_DIMENSIONS` (1536) vectors —
  // the text-embedding-3-* family does via the `dimensions` parameter.
  // Changing it requires `npm run knowledge:reindex` (vectors from different
  // models are never compared: `knowledge_chunks.embedding_model`).
  registerEmbeddingProvider(
    new OpenAIEmbeddingProvider({ apiKey, model: process.env.OPENAI_EMBEDDING_MODEL || undefined }),
  );
}

/**
 * Fase 7f: the deterministic fake `EmbeddingProvider`, only when
 * `E2E_FAKE_EMBEDDINGS=true` — set exclusively by `playwright.config.ts`, so
 * the E2E suite can upload and search documents without an OpenAI key. Never
 * in `.env.example` or any deployment config, and refused outright on Vercel
 * (its vectors are semantically meaningless; `CLAUDE.md` §3).
 */
async function registerFakeEmbeddingProviderForE2E() {
  if (process.env.E2E_FAKE_EMBEDDINGS !== "true" || process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.VERCEL) {
    console.warn("[knowledge] E2E_FAKE_EMBEDDINGS is ignored on Vercel.");
    return;
  }
  // The real provider wins if both are configured.
  const { getEmbeddingProvider, registerEmbeddingProvider } = await import("@/modules/knowledge/embedding-provider");
  try {
    getEmbeddingProvider();
    return;
  } catch {
    // none registered yet: fall through
  }
  const { createFakeEmbeddingProvider } = await import("@/modules/knowledge/testing/fake-embedding-provider");
  registerEmbeddingProvider(createFakeEmbeddingProvider());
}

/**
 * Fase 8: the real `LLMProvider` (OpenAI chat completions), registered only
 * when `OPENAI_API_KEY` is set. Absent everywhere else, `getLLMProvider()`
 * throws and the copilot is simply unavailable — never a silent fake.
 * `OPENAI_LLM_MODEL` overrides the default model.
 */
async function registerOpenAILLMProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || process.env.NEXT_RUNTIME !== "nodejs" || activeAIProvider() !== "openai") {
    return;
  }

  const { registerLLMProvider } = await import("@/modules/ai/llm-provider");
  const { OpenAILLMProvider } = await import("@/modules/ai/openai-llm-provider");
  registerLLMProvider(new OpenAILLMProvider({ apiKey, model: process.env.OPENAI_LLM_MODEL || undefined }));
}

/**
 * Fase 8: the deterministic fake `LLMProvider`, only when `E2E_FAKE_LLM=true`
 * — set exclusively by `playwright.config.ts` — and never on Vercel. The real
 * provider (registered from `OPENAI_API_KEY`) wins if both are configured.
 */
async function registerFakeLLMProviderForE2E() {
  if (process.env.E2E_FAKE_LLM !== "true" || process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.VERCEL) {
    console.warn("[ai] E2E_FAKE_LLM is ignored on Vercel.");
    return;
  }
  const { hasLLMProvider, registerLLMProvider } = await import("@/modules/ai/llm-provider");
  if (hasLLMProvider()) {
    return;
  }
  const { createE2EFakeLLMProvider } = await import("@/modules/ai/testing/fake-llm-provider");
  registerLLMProvider(createE2EFakeLLMProvider());
}

/**
 * Which real AI backend serves the copilot and the embeddings: `AI_PROVIDER`
 * (`openai` | `gemini`) when set, else OpenAI if `OPENAI_API_KEY` exists, else
 * Gemini if `GEMINI_API_KEY` exists. One backend at a time — the embedding
 * column holds one provider's vectors (`knowledge_chunks.embedding_model`).
 */
function activeAIProvider(): "openai" | "gemini" | null {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit === "openai" || explicit === "gemini") {
    return explicit;
  }
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

/**
 * Gemini as the AI backend (`LLMProvider` + `EmbeddingProvider`), only when it
 * is the active provider and `GEMINI_API_KEY` is set. `GEMINI_LLM_MODEL` and
 * `GEMINI_EMBEDDING_MODEL` override the defaults; changing the embedding
 * model (or switching provider) needs `npm run knowledge:reindex`.
 */
async function registerGeminiProviders() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.NEXT_RUNTIME !== "nodejs" || activeAIProvider() !== "gemini") {
    return;
  }

  const { registerLLMProvider } = await import("@/modules/ai/llm-provider");
  const { GeminiLLMProvider } = await import("@/modules/ai/gemini-llm-provider");
  registerLLMProvider(new GeminiLLMProvider({ apiKey, model: process.env.GEMINI_LLM_MODEL || undefined }));

  const { registerEmbeddingProvider } = await import("@/modules/knowledge/embedding-provider");
  const { GeminiEmbeddingProvider } = await import("@/modules/knowledge/gemini-embedding-provider");
  registerEmbeddingProvider(
    new GeminiEmbeddingProvider({ apiKey, model: process.env.GEMINI_EMBEDDING_MODEL || undefined }),
  );
}
