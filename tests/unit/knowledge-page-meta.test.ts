import { describe, expect, it } from "vitest";
import { extractPageMeta, extractTitle } from "@/modules/knowledge/ingestion/extract-web";

describe("extractTitle", () => {
  it("reads the title, decoding entities and collapsing whitespace", () => {
    expect(extractTitle("<title>\n  Guía &amp; trámites \n</title>")).toBe("Guía & trámites");
  });

  it("is null without a title or with an empty one", () => {
    expect(extractTitle("<p>sin título</p>")).toBeNull();
    expect(extractTitle("<title>   </title>")).toBeNull();
  });
});

describe("extractPageMeta", () => {
  const base = "https://www.example.org/blog/";

  it("prefers the site name and the Open Graph image, resolved against the page address", () => {
    const html = `<head><title>Inicio | Ejemplo</title>
      <meta property="og:site_name" content="Ejemplo S.L.">
      <meta content="/img/portada.png" property="og:image"></head>`;
    expect(extractPageMeta(html, base)).toEqual({ title: "Ejemplo S.L.", imageUrl: "https://www.example.org/img/portada.png" });
  });

  it("falls back to the title and to the Twitter image", () => {
    const html = `<title>Solo título</title><meta name="twitter:image" content="https://cdn.example.org/a.jpg">`;
    expect(extractPageMeta(html, base)).toEqual({ title: "Solo título", imageUrl: "https://cdn.example.org/a.jpg" });
  });

  it("keeps only http(s) images and tolerates a page with nothing", () => {
    expect(extractPageMeta(`<meta property="og:image" content="javascript:alert(1)">`, base).imageUrl).toBeNull();
    expect(extractPageMeta(`<meta property="og:image" content="data:image/png;base64,AAAA">`, base).imageUrl).toBeNull();
    expect(extractPageMeta("<p>nada</p>", base)).toEqual({ title: null, imageUrl: null });
  });
});
