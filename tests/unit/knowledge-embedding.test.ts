import { describe, expect, it } from "vitest";
import { createFakeEmbeddingProvider } from "@/modules/knowledge/testing/fake-embedding-provider";
import { EMBEDDING_DIMENSIONS } from "@/modules/knowledge/schema";

/** Unit tests for the deterministic fake EmbeddingProvider (Fase 7a). */

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

describe("fake EmbeddingProvider", () => {
  const provider = createFakeEmbeddingProvider();

  it("reports the schema's dimension and returns vectors of that length", async () => {
    expect(provider.dimensions).toBe(EMBEDDING_DIMENSIONS);
    const [vec] = await provider.embed(["convenio colectivo del sector"]);
    expect(vec).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("is deterministic — identical text yields the identical vector", async () => {
    const [a] = await provider.embed(["reglamento de extranjería, artículo 124"]);
    const [b] = await provider.embed(["reglamento de extranjería, artículo 124"]);
    expect(a).toEqual(b);
  });

  it("returns unit-norm vectors (cosine similarity is well defined)", async () => {
    const [vec] = await provider.embed(["texto cualquiera con varias palabras"]);
    expect(norm(vec)).toBeCloseTo(1, 6);
  });

  it("gives empty / punctuation-only text a defined unit vector, not NaN", async () => {
    const [vec] = await provider.embed(["   ...   "]);
    expect(norm(vec)).toBeCloseTo(1, 6);
    expect(vec.some(Number.isNaN)).toBe(false);
  });

  it("returns one vector per input, in order, for a batch", async () => {
    const texts = ["uno", "dos", "tres"];
    const vecs = await provider.embed(texts);
    expect(vecs).toHaveLength(3);
    // Order preserved: re-embedding a single input matches its batch slot.
    const [justTwo] = await provider.embed(["dos"]);
    expect(vecs[1]).toEqual(justTwo);
  });

  it("scores texts that share words closer than texts that share none", async () => {
    const [base] = await provider.embed(["permiso de residencia y trabajo por cuenta ajena"]);
    const [similar] = await provider.embed(["permiso de residencia por cuenta ajena renovado"]);
    const [unrelated] = await provider.embed(["horario de apertura de la piscina municipal"]);
    expect(cosine(base, similar)).toBeGreaterThan(cosine(base, unrelated));
  });
});
