import { describe, expect, it, vi } from "vitest";
import { OpenAILLMProvider } from "@/modules/ai/openai-llm-provider";

const request = { system: "s", user: "u", schemaName: "x", jsonSchema: { type: "object" } };

function provider(fetchImpl: unknown) {
  return new OpenAILLMProvider({ apiKey: "sk-test", fetchImpl: fetchImpl as typeof fetch });
}

describe("OpenAILLMProvider", () => {
  it("sends a strict json_schema request and parses the content", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ model: "gpt-x", choices: [{ message: { content: '{"a":1}' } }] }),
    );
    const result = await provider(fetchImpl).generateStructured(request);

    expect(result).toEqual({ output: { a: 1 }, model: "gpt-x" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test" });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-5.4-mini");
    expect(body).not.toHaveProperty("temperature");
    expect(body.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "x", strict: true } });
  });

  it("uses the configured model", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ choices: [{ message: { content: "{}" } }] }));
    await new OpenAILLMProvider({ apiKey: "k", model: "other-model", fetchImpl: fetchImpl as unknown as typeof fetch }).generateStructured(request);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe("other-model");
  });

  it("throws on a non-OK status, a refusal and invalid JSON", async () => {
    await expect(provider(vi.fn(async () => new Response("no", { status: 500 }))).generateStructured(request)).rejects.toThrow(/500/);
    await expect(
      provider(vi.fn(async () => Response.json({ choices: [{ message: { refusal: "no" } }] }))).generateStructured(request),
    ).rejects.toThrow(/no structured content/);
    await expect(
      provider(vi.fn(async () => Response.json({ choices: [{ message: { content: "not json" } }] }))).generateStructured(request),
    ).rejects.toThrow(/not valid JSON/);
  });
});
