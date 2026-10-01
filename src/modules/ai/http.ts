/** Maps a `CopilotError` to its HTTP response. The body carries a stable code and a Spanish message for the UI, never provider details. */
import { CopilotError } from "@/modules/ai/service";

const RESPONSES: Record<CopilotError["code"], { status: number; message: string }> = {
  NOT_FOUND: { status: 404, message: "No encontrado." },
  NOT_AVAILABLE: { status: 503, message: "El copiloto no está disponible en este entorno." },
  NOTHING_TO_ANSWER: { status: 422, message: "No hay ningún mensaje de la persona al que responder." },
  NOTHING_TO_USE: { status: 409, message: "Esta sugerencia no tiene ninguna respuesta que usar como borrador." },
  RATE_LIMITED: { status: 429, message: "Espera unos segundos antes de pedir otra sugerencia." },
  GENERATION_FAILED: { status: 502, message: "El copiloto no pudo generar una sugerencia." },
  ALREADY_RESOLVED: { status: 409, message: "La sugerencia ya estaba resuelta." },
};

export function copilotErrorResponse(error: CopilotError): Response {
  const { status, message } = RESPONSES[error.code];
  return Response.json(
    { error: error.code, message },
    {
      status,
      headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined,
    },
  );
}
