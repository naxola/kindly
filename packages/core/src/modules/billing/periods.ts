/** Billing periods: half-open [start, end) instants in UTC (ADR 0012). */
export interface Period {
  start: Date
  end: Date
}

/** Calendar month (UTC) containing `now`: the period of organizations on the default plan. */
export function calendarMonth(now: Date): Period {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

/** Adds whole intervals keeping the anchor day (clamped to the month's last day). */
export function addInterval(date: Date, interval: 'month' | 'year', count = 1): Date {
  const months = interval === 'year' ? 12 * count : count
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  )
}

/**
 * Period containing `now`, rolling a stored period forward when the provider has not
 * renewed it yet (a late webhook must not freeze the usage counters). Later periods are
 * counted from the stored end, so month-end anchors do not drift (31 → 30 → 31…).
 */
export function periodContaining(stored: Period, interval: 'month' | 'year', now: Date): Period {
  if (now < stored.end) return stored
  let n = 1
  while (addInterval(stored.end, interval, n) <= now) n++
  return {
    start: n === 1 ? stored.end : addInterval(stored.end, interval, n - 1),
    end: addInterval(stored.end, interval, n),
  }
}
