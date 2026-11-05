/**
 * Caps a stream that is being passed through to a member's browser (UI-10c):
 * if the provider sends more than `maxBytes` the stream errors instead of
 * delivering the rest. Nothing is buffered or written anywhere — each chunk
 * is forwarded as it arrives.
 */
export class MediaTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`The file exceeds the ${maxBytes}-byte limit.`);
    this.name = "MediaTooLargeError";
  }
}

export function limitStream(body: ReadableStream<Uint8Array>, maxBytes: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maxBytes) {
          controller.error(new MediaTooLargeError(maxBytes));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
