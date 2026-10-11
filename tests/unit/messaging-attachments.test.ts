import { describe, expect, it } from "vitest";
import {
  attachmentPlaceholder,
  bodyForAttachment,
  isMediaExpired,
  mediaAvailableUntil,
  safeContentType,
  safeDownloadName,
  type MessageAttachment,
} from "@/modules/messaging/attachments";

const doc: MessageAttachment = { kind: "DOCUMENT", mediaId: "m1", mimeType: "application/pdf", filename: "Pasaporte.pdf" };
const image: MessageAttachment = { kind: "IMAGE", mediaId: "m2", mimeType: "image/jpeg", filename: null };

describe("attachment text", () => {
  it("describes a file by its kind, naming documents", () => {
    expect(attachmentPlaceholder(doc)).toBe("[Documento: Pasaporte.pdf]");
    expect(attachmentPlaceholder({ kind: "DOCUMENT", filename: null })).toBe("[Documento]");
    expect(attachmentPlaceholder(image)).toBe("[Imagen]");
    expect(attachmentPlaceholder({ kind: "VIDEO", filename: "x.mp4" })).toBe("[Vídeo]");
  });

  it("uses the sender's caption when there is one", () => {
    expect(bodyForAttachment("  Mi pasaporte  ", doc)).toBe("Mi pasaporte");
    expect(bodyForAttachment("   ", image)).toBe("[Imagen]");
    expect(bodyForAttachment(undefined, doc)).toBe("[Documento: Pasaporte.pdf]");
  });
});

describe("how long the provider serves a file", () => {
  const received = new Date("2026-10-01T10:00:00Z");

  it("adds the channel's days to the moment it was received", () => {
    expect(mediaAvailableUntil(received, 7)?.toISOString()).toBe("2026-10-08T10:00:00.000Z");
    expect(mediaAvailableUntil(received, null)).toBeNull();
  });

  it("is expired from the exact deadline, and always when the channel cannot download", () => {
    expect(isMediaExpired(received, 7, new Date("2026-10-08T09:59:59Z"))).toBe(false);
    expect(isMediaExpired(received, 7, new Date("2026-10-08T10:00:00Z"))).toBe(true);
    expect(isMediaExpired(received, null, received)).toBe(true);
  });
});

describe("safe download headers", () => {
  it("only echoes a well-formed mime type", () => {
    expect(safeContentType("Image/JPEG")).toBe("image/jpeg");
    expect(safeContentType("application/pdf")).toBe("application/pdf");
    expect(safeContentType("text/html\r\nSet-Cookie: x=1")).toBe("application/octet-stream");
    expect(safeContentType("nonsense")).toBe("application/octet-stream");
    expect(safeContentType(null)).toBe("application/octet-stream");
  });

  it("strips path parts, quotes and control characters from the file name", () => {
    expect(safeDownloadName(doc)).toBe("Pasaporte.pdf");
    expect(safeDownloadName({ ...doc, filename: '../../etc/pass"wd\r\n.pdf' })).toBe("_._etc_pass_wd_.pdf");
    expect(safeDownloadName({ ...doc, filename: "...hidden.pdf" })).toBe("hidden.pdf");
    expect(safeDownloadName({ ...doc, filename: "a".repeat(300) })).toHaveLength(120);
  });

  it("falls back to a name by kind, with an extension when the type is known", () => {
    expect(safeDownloadName(image)).toBe("imagen.jpg");
    expect(safeDownloadName({ kind: "AUDIO", filename: null, mimeType: "audio/x-unknown" })).toBe("audio");
    expect(safeDownloadName({ ...doc, filename: "  " })).toBe("documento.pdf");
  });
});
