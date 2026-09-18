import { after } from "next/server";
import { receiveWebhook } from "@/modules/messaging/webhook-service";

/**
 * Generic inbound webhook endpoint for every messaging channel — no
 * provider-specific code here, everything provider-shaped goes through the
 * channel's registered `MessagingAdapter` (docs/ARCHITECTURE.md sección 4).
 *
 * Never registers a real channel itself: in PKG-003 the adapter registry
 * (src/modules/messaging/registry.ts) is empty in production, so every real
 * request 404s until Fase 4/5 registers a real adapter. Only tests register
 * a fake one to exercise this route end to end.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channel: string; accountId: string }> },
) {
  const { channel, accountId } = await params;
  const rawBody = await request.text();
  const headers: Record<string, string> = Object.fromEntries(request.headers.entries());

  const outcome = await receiveWebhook(channel, accountId, rawBody, headers);

  if (outcome.status === 404) {
    return new Response(null, { status: 404 });
  }
  if (outcome.status === 401) {
    return new Response(null, { status: 401 });
  }

  // Respond immediately, normalize afterwards (docs/ARCHITECTURE.md sección
  // 7: "Return HTTP 200 → Async processing"). See docs/DECISIONS.md for why
  // this uses `after()` instead of a pg-boss/Inngest job for now.
  after(outcome.process);
  return new Response(null, { status: 200 });
}
