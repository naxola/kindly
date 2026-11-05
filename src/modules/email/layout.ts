/**
 * Shared HTML shell for every transactional email Kindly sends. Email clients
 * ignore external CSS and CSS variables, so the markup is table-based with
 * inline styles — the one place where hardcoded colors are correct (the
 * design tokens in `docs/ui/` apply to the app interface, not to email).
 */
const BRAND = "#1f6f5c";
const TEXT = "#1f2933";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const BACKGROUND = "#f3f4f6";
const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A paragraph of body copy. `html` must already be escaped by the caller. */
export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:${TEXT};">${html}</p>`;
}

/** Bulletproof call-to-action button (works in Outlook, which ignores padding on <a>). */
export function button(label: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px 0;">
<tr><td style="border-radius:6px;background:${BRAND};">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** A bordered box of label/value rows, e.g. the delegate's contact details. */
export function detailsCard(title: string, rows: { label: string; value: string; href?: string }[]): string {
  const body = rows
    .map((row) => {
      const value = row.href
        ? `<a href="${escapeHtml(row.href)}" style="color:${BRAND};text-decoration:none;">${escapeHtml(row.value)}</a>`
        : escapeHtml(row.value);
      return `<tr>
<td style="padding:6px 0;font-size:13px;color:${MUTED};width:110px;vertical-align:top;">${escapeHtml(row.label)}</td>
<td style="padding:6px 0;font-size:15px;color:${TEXT};font-weight:600;">${value}</td>
</tr>`;
    })
    .join("\n");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;border:1px solid ${BORDER};border-radius:8px;background:#fafafa;">
<tr><td style="padding:16px 20px;">
<p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.6px;text-transform:uppercase;color:${MUTED};font-weight:600;">${escapeHtml(title)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${body}</table>
</td></tr></table>`;
}

export interface EmailLayoutInput {
  /** Hidden inbox preview text. */
  preheader: string;
  /** Name shown in the header band. */
  brandName: string;
  heading: string;
  /** Already-escaped HTML built from `paragraph`/`button`/`detailsCard`. */
  bodyHtml: string;
  footerNote: string;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BACKGROUND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BACKGROUND};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;font-family:${FONT};">
<tr><td style="padding:20px 32px;background:${BRAND};border-radius:12px 12px 0 0;font-size:18px;font-weight:700;color:#ffffff;">${escapeHtml(input.brandName)}</td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 20px 0;font-size:22px;line-height:30px;color:${TEXT};">${escapeHtml(input.heading)}</h1>
${input.bodyHtml}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid ${BORDER};font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(input.footerNote)}</td></tr>
</table>
</td></tr></table>
</body>
</html>`;
}
