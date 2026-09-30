import { describe, expect, it, vi } from "vitest";
import { fetchWebText, htmlToText } from "@/modules/knowledge/ingestion/extract-web";

/**
 * Unit tests for web extraction (Fase 7b). `htmlToText` is pure; the
 * `fetchWebText` tests use a stubbed `fetchImpl` — never a real network
 * call (`CLAUDE.md` §6).
 */

describe("htmlToText", () => {
  it("strips tags and keeps text", () => {
    expect(htmlToText("<p>Hola <b>mundo</b></p>")).toBe("Hola mundo");
  });

  it("removes script and style blocks entirely, including their content", () => {
    const html = "<style>body{color:red}</style><p>Texto</p><script>alert(1)</script>";
    expect(htmlToText(html)).toBe("Texto");
  });

  it("removes HTML comments", () => {
    expect(htmlToText("<p>Antes</p><!-- oculto -->\n<p>Después</p>")).toBe("Antes\n\nDespués");
  });

  it("turns block-level tags into line breaks, preserving paragraph structure", () => {
    // Each <p>...</p> contributes a leading and trailing break, so sibling
    // paragraphs end up separated by a blank line — exactly the boundary
    // `chunking.ts`'s paragraph split looks for.
    const html = "<div><p>Artículo 1</p><p>Primer párrafo.</p><p>Segundo párrafo.</p></div>";
    expect(htmlToText(html)).toBe("Artículo 1\n\nPrimer párrafo.\n\nSegundo párrafo.");
  });

  it("decodes named and numeric HTML entities", () => {
    expect(htmlToText("<p>A&amp;B &lt;tag&gt; &quot;cita&quot; ni&ntilde;o &#39;x&#39; &#x41;</p>")).toBe(
      'A&B <tag> "cita" ni&ntilde;o \'x\' A',
    );
  });

  it("collapses runs of blank lines to at most one blank line", () => {
    const html = "<p>Uno</p><br><br><br><p>Dos</p>";
    expect(htmlToText(html)).toBe("Uno\n\nDos");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});

describe("fetchWebText", () => {
  it("fetches and extracts text from the given URL", async () => {
    const fetchImpl = vi.fn(async () => new Response("<p>Contenido</p>", { status: 200 }));

    const text = await fetchWebText("https://example.org/ley", { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(text).toBe("Contenido");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects non-http(s) URLs without ever calling fetch", async () => {
    const fetchImpl = vi.fn();

    await expect(
      fetchWebText("file:///etc/passwd", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/http/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws when the response is not ok", async () => {
    const fetchImpl = vi.fn(async () => new Response("not found", { status: 404 }));

    await expect(
      fetchWebText("https://example.org/missing", { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/404/);
  });

  it("throws when the response exceeds the byte limit", async () => {
    const fetchImpl = vi.fn(async () => new Response("x".repeat(100), { status: 200 }));

    await expect(
      fetchWebText("https://example.org/huge", { fetchImpl: fetchImpl as unknown as typeof fetch, maxBytes: 10 }),
    ).rejects.toThrow(/exceeds/i);
  });
});
