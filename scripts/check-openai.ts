/**
 * Smoke-test: verifies that OPENAI_API_KEY is valid and the configured model
 * accepts structured output.  Run with:
 *
 *   npx tsx scripts/check-openai.ts
 *
 * The script exits 0 on success, 1 on any failure, and prints a clear
 * diagnosis so you know whether the problem is the key, the model, or the
 * structured-output feature.
 */

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_LLM_MODEL ?? "gpt-4o-mini";

if (!apiKey) {
  console.error("❌  OPENAI_API_KEY is not set.");
  process.exit(1);
}

console.log(`🔑  Key   : ${apiKey.slice(0, 8)}…${apiKey.slice(-4)}`);
console.log(`🤖  Model : ${model}`);
console.log("⏳  Calling OpenAI chat/completions with structured output…\n");

const body = {
  model,
  messages: [
    { role: "system", content: "You are a test assistant. Always respond with the exact JSON the schema requests." },
    { role: "user", content: "Reply with a greeting in Spanish." },
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "greeting",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["greeting"],
        properties: { greeting: { type: "string" } },
      },
    },
  },
};

try {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();

  if (response.status === 401) {
    console.error("❌  401 Unauthorized — the API key is invalid or revoked.");
    console.error("    Check it at https://platform.openai.com/api-keys");
    process.exit(1);
  }

  if (response.status === 403) {
    console.error("❌  403 Forbidden — the key exists but lacks permission for chat/completions.");
    console.error("    In OpenAI → API keys, set the key to Restricted and enable 'Chat Completions'.");
    process.exit(1);
  }

  if (response.status === 404) {
    console.error(`❌  404 — model '${model}' not found or not available on your plan.`);
    console.error("    Try OPENAI_LLM_MODEL=gpt-4o-mini");
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`❌  HTTP ${response.status} from OpenAI:`);
    console.error(text);
    process.exit(1);
  }

  const data = JSON.parse(text) as {
    model?: string;
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    console.error("❌  Response has no choices. Raw body:");
    console.error(text);
    process.exit(1);
  }

  if (message.refusal) {
    console.error(`❌  Model refused: ${message.refusal}`);
    process.exit(1);
  }

  if (!message.content) {
    console.error("❌  Empty content in response.");
    process.exit(1);
  }

  const parsed = JSON.parse(message.content) as { greeting?: string };

  console.log("✅  OpenAI responded correctly.");
  console.log(`    Served by : ${data.model ?? model}`);
  console.log(`    Reply     : ${parsed.greeting}`);
  console.log("\nYour key and model are working. The problem is elsewhere in the app.");
} catch (err) {
  console.error("❌  Network error reaching api.openai.com:");
  console.error(`    ${String(err)}`);
  console.error("    Check your internet connection or proxy settings.");
  process.exit(1);
}
