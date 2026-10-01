import { describe, expect, it, vi } from "vitest";
import { GeminiLLMProvider } from "@/modules/ai/gemini-llm-provider";
import { GeminiEmbeddingProvider } from "@/modules/knowledge/gemini-embedding-provider";
import { EMBEDDING_DIMENSIONS } from "@/modules/knowledge/schema";

const request = { system: "s", user: "u", schemaName: "x", jsonSchema: { type: "object" } };
const llm = (fetchImpl: unknown) => new GeminiLLMProvider({ apiKey: "g-test", retryDelayMs: 0, fetchImpl: fetchImpl as typeof fetch });
const embedder = (fetchImpl: unknown) =>
  new GeminiEmbeddingProvider({ apiKey: "g-test", fetchImpl: fetchImpl as typeof fetch });

describe("GeminiLLMProvider", () => {
  it("retries a transient 503 and succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { message: "high demand" } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }));
    const result = await llm(fetchImpl).generateStructured(request);
    expect(result.output).toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts on a persistent 503", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: "high demand" } }, { status: 503 }));
    await expect(llm(fetchImpl).generateStructured(request)).rejects.toThrow("503");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 404", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: { message: "gone" } }, { status: 404 }));
    await expect(llm(fetchImpl).generateStructured(request)).rejects.toThrow("404");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends a JSON-schema request with the key in a header and parses the text", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ modelVersion: "gemini-x", candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }),
    );
    const result = await llm(fetchImpl).generateStructured(request);

    expect(result).toEqual({ output: { a: 1 }, model: "gemini-x" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(url).not.toContain("g-test");
    expect(init.headers).toMatchObject({ "x-goog-api-key": "g-test" });
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object" },
    });
    expect(body.systemInstruction.parts[0].text).toBe("s");
  });

  it("throws on an HTTP error (message only), a blocked prompt and invalid JSON", async () => {
    await expect(
      llm(vi.fn(async () => Response.json({ error: { message: "quota" } }, { status: 429 }))).generateStructured(request),
    ).rejects.toThrow(/429: quota/);
    await expect(
      llm(vi.fn(async () => Response.json({ promptFeedback: { blockReason: "SAFETY" } }))).generateStructured(request),
    ).rejects.toThrow(/no structured content/);
    await expect(
      llm(vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "nope" }] } }] }))).generateStructured(
        request,
      ),
    ).rejects.toThrow(/not valid JSON/);
  });
});

describe("GeminiEmbeddingProvider", () => {
  const vector = (value: number) => ({ values: new Array(EMBEDDING_DIMENSIONS).fill(value) });

  it("asks for 1536 dimensions, normalizes and keeps the input order", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ embeddings: [vector(2), vector(4)] }));
    const result = await embedder(fetchImpl).embed(["a", "b"]);

    expect(result).toHaveLength(2);
    expect(Math.hypot(...result[0])).toBeCloseTo(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("gemini-embedding-001:batchEmbedContents");
    const body = JSON.parse(init.body as string);
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0].outputDimensionality).toBe(EMBEDDING_DIMENSIONS);
  });

  it("identifies itself per model, splits batches over 100 and rejects wrong sizes", async () => {
    expect(embedder(vi.fn()).id).toBe("gemini:gemini-embedding-001");

    const fetchImpl = vi.fn(async (_url: unknown, init: RequestInit) => {
      const n = JSON.parse(init.body as string).requests.length;
      return Response.json({ embeddings: Array.from({ length: n }, () => vector(1)) });
    });
    const out = await embedder(fetchImpl).embed(Array.from({ length: 150 }, (_, i) => `t${i}`));
    expect(out).toHaveLength(150);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await expect(
      embedder(vi.fn(async () => Response.json({ embeddings: [{ values: [1, 2] }] }))).embed(["a"]),
    ).rejects.toThrow(/2-dimension/);
  });
});
