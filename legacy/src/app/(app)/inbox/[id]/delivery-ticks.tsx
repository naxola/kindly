import type { ThreadMessage } from "@/modules/conversations/service";

export type DisplayStatus = ThreadMessage["deliveryStatus"] | "SENDING";

const STATUS: Record<DisplayStatus, { symbol: string; label: string; className: string }> = {
  SENDING: { symbol: "◷", label: "Enviando", className: "text-foreground-muted" },
  PENDING: { symbol: "◷", label: "Pendiente", className: "text-foreground-muted" },
  SENT: { symbol: "✓", label: "Enviado", className: "text-foreground-muted" },
  DELIVERED: { symbol: "✓✓", label: "Entregado", className: "text-foreground-muted" },
  READ: { symbol: "✓✓", label: "Leído", className: "text-info" },
  FAILED: { symbol: "!", label: "No enviado", className: "text-destructive" },
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
