import type { ThreadMessage } from "@/modules/conversations/service";

export type DisplayStatus = ThreadMessage["deliveryStatus"] | "SENDING";

const STATUS: Record<DisplayStatus, { symbol: string; label: string; className: string }> = {
  SENDING: { symbol: "◷", label: "Enviando", className: "text-zinc-400" },
  PENDING: { symbol: "◷", label: "Pendiente", className: "text-zinc-400" },
  SENT: { symbol: "✓", label: "Enviado", className: "text-zinc-300" },
  DELIVERED: { symbol: "✓✓", label: "Entregado", className: "text-zinc-300" },
  READ: { symbol: "✓✓", label: "Leído", className: "text-sky-400" },
  FAILED: { symbol: "!", label: "No enviado", className: "text-red-400" },
};

/** WhatsApp-style ticks (PKG-013): ✓ sent, ✓✓ delivered, blue ✓✓ read. */
export function DeliveryTicks({ status }: { status: DisplayStatus }) {
  const { symbol, label, className } = STATUS[status];
  return (
    <span className={`font-medium tracking-tighter ${className}`} title={label} aria-label={label} role="img">
      {symbol}
    </span>
  );
}
