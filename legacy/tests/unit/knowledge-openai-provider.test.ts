import { describe, expect, it, vi } from "vitest";
import { OpenAIEmbeddingProvider } from "@/modules/knowledge/openai-embedding-provider";
import { EMBEDDING_DIMENSIONS } from "@/modules/knowledge/schema";

/**
 * Unit tests for the real `EmbeddingProvider` (Fase 7b). `fetch` is always
 * stubbed — never a real call to OpenAI in CI (`CLAUDE.md` §6).
 */

function vector(fill: number): number[] {
  return new Array(EMBEDDING_DIMENSIONS).fill(fill);
}

describe("OpenAIEmbeddingProvider", () => {
  it("returns [] without calling fetch for an empty batch", async () => {
    const fetchImpl = vi.fn();
    const provider = new OpenAIEmbeddingProvider({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.embed([])).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the batch to OpenAI's embeddings endpoint and maps the response back in order", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: [
          { index: 1, embedding: vector(2) },
          { index: 0, embedding: vector(1) },
        ],
      }),
    );
    const provider = new OpenAIEmbeddingProvider({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.embed(["uno", "dos"]);

    expect(result).toEqual([vector(1), vector(2)]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test" });
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "text-embedding-3-small",
      input: ["uno", "dos"],
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });

  it("uses the configured model, reflected in id and the request body", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ index: 0, embedding: vector(1) }] }));
    const provider = new OpenAIEmbeddingProvider({
      apiKey: "sk-test",
      model: "text-embedding-3-large",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(provider.id).toBe("openai:text-embedding-3-large");
    await provider.embed(["x"]);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).model).toBe("text-embedding-3-large");
  });

  it("throws with only OpenAI's error message on a non-ok response, never the request", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "Invalid API key" } }), { status: 401 }),
    );
    const provider = new OpenAIEmbeddingProvider({
      apiKey: "sk-secret",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.embed(["x"])).rejects.toThrow("OpenAI embeddings 401: Invalid API key");
    await provider.embed(["x"]).catch((error: Error) => {
      expect(error.message).not.toContain("sk-secret");
    });
  });

  it("throws when OpenAI returns a different number of vectors than inputs", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ index: 0, embedding: vector(1) }] }));
    const provider = new OpenAIEmbeddingProvider({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.embed(["uno", "dos"])).rejects.toThrow(/2 embeddings for 2 inputs|1 embeddings for 2/);
  });

  it("throws when a returned vector has the wrong dimension", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ index: 0, embedding: [1, 2, 3] }] }));
    const provider = new OpenAIEmbeddingProvider({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.embed(["x"])).rejects.toThrow(/3-dimension vector, expected 1536/);
  });
});
