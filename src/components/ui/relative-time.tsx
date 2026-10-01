const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

// Two formatters instead of one `toLocaleString(..., { dateStyle, timeStyle })`
// call: a combined date+time style composes its connector wording ("a las"
// vs. ",") from ICU's own locale data, which can differ by a build's ICU
// version — Node's and a browser's rarely match exactly. `DataList`'s
// `renderItem` is a function prop, which forces it (and anything it
// renders, including this) to run as a Client Component — so whatever this
// formats has to come out byte-identical on the server render and the
// client hydration, or React flags a mismatch. Two simpler formats joined
// by a separator we choose ourselves have no such locale-composed part.
const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

function relativeLabel(date: Date, now: Date): string {
  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (Math.abs(diffSeconds) < 60) {
    return "ahora mismo";
  }
  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return formatter.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return formatter.format(Math.round(diffSeconds / 60), "minute");
}

/**
 * "hace 5 min", with the full date/time as the tooltip and in `dateTime`
 * for assistive tech (docs/ui/INBOX.md §3). A plain Server Component: no
 * ticking interval — its callers (Inbox, the conversation thread) already
 * poll and re-render every few seconds, which is what keeps it fresh.
 */
export function RelativeTime({ date, className }: { date: Date | string; className?: string }) {
  const value = typeof date === "string" ? new Date(date) : date;
  const full = `${dateFormatter.format(value)}, ${timeFormatter.format(value)}`;
  return (
    <time dateTime={value.toISOString()} title={full} className={className}>
      {relativeLabel(value, new Date())}
    </time>
  );
}
