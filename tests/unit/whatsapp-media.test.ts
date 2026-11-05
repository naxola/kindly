import { describe, expect, it, vi } from "vitest";
import { WhatsAppTestAdapter } from "@/modules/messaging/testing/whatsapp-test-adapter";
import { MediaUnavailableError, type MessagingAccountRecord } from "@/modules/messaging/adapter";
import { MAX_MEDIA_BYTES, type MessageAttachment } from "@/modules/messaging/attachments";
import { limitStream, MediaTooLargeError } from "@/modules/messaging/media-stream";

/**
 * UI-10c: inbound files on WhatsApp. Parsing follows the payloads in Meta's
 * webhook reference (id, mime_type, sha256, caption; filename for documents;
 * no file size) and the download follows its two steps (GET /{media-id} for a
 * short-lived URL, then that URL with the bearer token). `fetch` is injected:
 * never a real network call.
 */

const PHONE_NUMBER_ID = "1355229964336175";

function makeAdapter(fetchImpl?: typeof fetch) {
  return new WhatsAppTestAdapter({
    phoneNumberId: PHONE_NUMBER_ID,
    accessToken: "test-token",
    appSecret: "secret",
    verifyToken: "verify",
    fetchImpl,
  });
}

function payload(message: Record<string, unknown>) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ wa_id: "34600111222", profile: { name: "Marta" } }],
              messages: [{ from: "34600111222", id: "wamid.1", timestamp: "1744344496", ...message }],
            },
          },
        ],
      },
    ],
  });
}

const parse = (message: Record<string, unknown>) => {
  const [event] = makeAdapter().parseWebhookEvents(payload(message));
  if (event.kind !== "MESSAGE") throw new Error("expected a MESSAGE event");
  return event;
};

describe("parsing inbound media", () => {
  it("reads an image with its caption", () => {
    const event = parse({ type: "image", image: { id: "1003", mime_type: "image/jpeg", sha256: "x", caption: "Taj Mahal" } });
    expect(event.attachment).toEqual({ kind: "IMAGE", mediaId: "1003", mimeType: "image/jpeg", filename: null });
    expect(event.text).toBe("Taj Mahal");
  });

  it("reads a document with its file name and falls back to a placeholder without caption", () => {
    const event = parse({ type: "document", document: { id: "6226", mime_type: "application/pdf", filename: "Pasaporte.pdf" } });
    expect(event.attachment).toEqual({ kind: "DOCUMENT", mediaId: "6226", mimeType: "application/pdf", filename: "Pasaporte.pdf" });
    expect(event.text).toBe("[Documento: Pasaporte.pdf]");
  });

  it("reads audio, video and stickers by id and mime type", () => {
    expect(parse({ type: "audio", audio: { id: "a1", mime_type: "audio/ogg" } }).attachment).toMatchObject({ kind: "AUDIO", mediaId: "a1" });
    expect(parse({ type: "video", video: { id: "v1", mime_type: "video/mp4" } }).attachment).toMatchObject({ kind: "VIDEO", mediaId: "v1" });
    expect(parse({ type: "sticker", sticker: { id: "s1", mime_type: "image/webp" } }).text).toBe("[Sticker]");
  });

  it("ignores a media message without an id and keeps plain text untouched", () => {
    const broken = parse({ type: "image", image: { mime_type: "image/jpeg" } });
    expect(broken.attachment).toBeNull();
    expect(broken.text).toMatch(/Mensaje de tipo "image"/);

    const text = parse({ type: "text", text: { body: "Hola" } });
    expect(text.attachment).toBeNull();
    expect(text.text).toBe("Hola");
  });

  it("declares that inbound files stay downloadable for 7 days", () => {
    expect(makeAdapter().capabilities.inboundMediaDays).toBe(7);
  });
});

const account = {} as MessagingAccountRecord;
const attachment: MessageAttachment = { kind: "DOCUMENT", mediaId: "6226", mimeType: "application/pdf", filename: "a.pdf" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const bytes = (text: string, headers: Record<string, string> = {}, status = 200) =>
  new Response(new TextEncoder().encode(text), { status, headers });

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await new Response(stream).arrayBuffer()));
}

describe("downloading inbound media", () => {
  it("asks Meta for the address, then fetches it with the bearer token, passing the bytes through", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ url: "https://93.184.216.34/file", mime_type: "application/pdf", id: "6226" }))
      .mockResolvedValueOnce(bytes("%PDF-1.4 contenido", { "content-type": "application/pdf", "content-length": "18" }));
    const media = await makeAdapter(fetchImpl as unknown as typeof fetch).downloadMedia!(account, attachment);

    expect(await readAll(media.body)).toBe("%PDF-1.4 contenido");
    expect(media).toMatchObject({ contentType: "application/pdf", contentLength: 18 });

    const [metaCall, fileCall] = fetchImpl.mock.calls;
    expect(String(metaCall[0])).toContain("/6226");
    expect(metaCall[1].headers.Authorization).toBe("Bearer test-token");
    expect(String(fileCall[0])).toBe("https://93.184.216.34/file");
    expect(fileCall[1]).toMatchObject({ headers: { Authorization: "Bearer test-token" }, redirect: "manual" });
  });

  it("reports an expired media id as unavailable (404, or 400 'does not exist')", async () => {
    const gone404 = vi.fn().mockResolvedValue(json({ error: { message: "not found" } }, 404));
    await expect(makeAdapter(gone404 as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toBeInstanceOf(MediaUnavailableError);

    const gone400 = vi.fn().mockResolvedValue(json({ error: { message: "Object with ID '6226' does not exist", code: 100 } }, 400));
    await expect(makeAdapter(gone400 as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toBeInstanceOf(MediaUnavailableError);

    const otherError = vi.fn().mockResolvedValue(json({ error: { message: "rate limit" } }, 429));
    await expect(makeAdapter(otherError as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.not.toBeInstanceOf(MediaUnavailableError);
  });

  it("reports a file the CDN no longer has as unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ url: "https://93.184.216.34/file" }))
      .mockResolvedValueOnce(bytes("", {}, 404));
    await expect(makeAdapter(fetchImpl as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toBeInstanceOf(MediaUnavailableError);
  });

  it("refuses an address that is not https, points at a private network or redirects", async () => {
    const plain = vi.fn().mockResolvedValueOnce(json({ url: "http://93.184.216.34/file" }));
    await expect(makeAdapter(plain as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toThrow(/usable download address/);

    const none = vi.fn().mockResolvedValueOnce(json({}));
    await expect(makeAdapter(none as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toThrow(/usable download address/);

    const priv = vi.fn().mockResolvedValueOnce(json({ url: "https://10.0.0.5/file" }));
    await expect(makeAdapter(priv as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toThrow(/public address/);
    expect(priv).toHaveBeenCalledTimes(1);

    const redirect = vi
      .fn()
      .mockResolvedValueOnce(json({ url: "https://93.184.216.34/file" }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://elsewhere.example/x" } }));
    await expect(makeAdapter(redirect as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toThrow(/status 302/);
  });

  it("refuses a file larger than the limit before reading it", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ url: "https://93.184.216.34/file" }))
      .mockResolvedValueOnce(bytes("x", { "content-length": String(MAX_MEDIA_BYTES + 1) }));
    await expect(makeAdapter(fetchImpl as unknown as typeof fetch).downloadMedia!(account, attachment)).rejects.toBeInstanceOf(MediaTooLargeError);
  });
});

describe("limitStream", () => {
  const source = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });

  it("passes everything through up to the limit", async () => {
    expect(await readAll(limitStream(source(["abc", "def"]), 6))).toBe("abcdef");
  });

  it("errors as soon as the provider sends more than the limit", async () => {
    await expect(readAll(limitStream(source(["abc", "def", "g"]), 6))).rejects.toBeInstanceOf(MediaTooLargeError);
  });
});
