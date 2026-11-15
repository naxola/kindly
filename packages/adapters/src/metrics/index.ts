import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Minimal Prometheus registry (ADR 0008, amendment): counters, gauges and histograms, rendered in
 * the text exposition format 0.0.4. No dependency: three metric types do not justify one.
 * Labels must be low cardinality (route templates, queue names, states), never ids or emails.
 */
type Labels = Record<string, string>

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const LABEL = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function check(name: string, labels: Labels = {}) {
  if (!NAME.test(name)) throw new Error(`Invalid metric name: ${name}`)
  for (const key of Object.keys(labels)) {
    if (!LABEL.test(key)) throw new Error(`Invalid label name: ${key}`)
  }
}

const escapeValue = (v: string) =>
  v.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
const keyOf = (labels: Labels) =>
  Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${escapeValue(v)}"`)
    .join(',')
const line = (name: string, key: string, value: number) =>
  `${name}${key ? `{${key}}` : ''} ${value}`

interface Metric {
  render(): string[]
}

export class Counter implements Metric {
  private readonly values = new Map<string, number>()
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  inc(labels: Labels = {}, by = 1) {
    check(this.name, labels)
    const key = keyOf(labels)
    this.values.set(key, (this.values.get(key) ?? 0) + by)
  }
  render() {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
      ...[...this.values].map(([key, v]) => line(this.name, key, v)),
    ]
  }
}

export class Gauge implements Metric {
  private values: { key: string; value: number }[] = []
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}
  /** Replaces every sample at once: states that disappeared stop being reported. */
  replace(samples: { labels: Labels; value: number }[]) {
    for (const s of samples) check(this.name, s.labels)
    this.values = samples.map((s) => ({ key: keyOf(s.labels), value: s.value }))
  }
  render() {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
      ...this.values.map((s) => line(this.name, s.key, s.value)),
    ]
  }
}

export class Histogram implements Metric {
  private readonly series = new Map<string, { buckets: number[]; sum: number; count: number }>()
  constructor(
    readonly name: string,
    readonly help: string,
    readonly bounds: number[],
  ) {}
  observe(labels: Labels, value: number) {
    check(this.name, labels)
    const key = keyOf(labels)
    let s = this.series.get(key)
    if (!s) this.series.set(key, (s = { buckets: this.bounds.map(() => 0), sum: 0, count: 0 }))
    this.bounds.forEach((bound, i) => {
      if (value <= bound) s.buckets[i]! += 1
    })
    s.sum += value
    s.count += 1
  }
  render() {
    const out = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`]
    for (const [key, s] of this.series) {
      const prefix = key ? `${key},` : ''
      this.bounds.forEach((bound, i) =>
        out.push(line(`${this.name}_bucket`, `${prefix}le="${bound}"`, s.buckets[i]!)),
      )
      out.push(line(`${this.name}_bucket`, `${prefix}le="+Inf"`, s.count))
      out.push(line(`${this.name}_sum`, key, Number(s.sum.toFixed(9))))
      out.push(line(`${this.name}_count`, key, s.count))
    }
    return out
  }
}

export class MetricsRegistry {
  private readonly metrics: Metric[] = []
  private readonly collectors: (() => void | Promise<void>)[] = []

  counter(name: string, help: string) {
    check(name)
    const m = new Counter(name, help)
    this.metrics.push(m)
    return m
  }
  gauge(name: string, help: string) {
    check(name)
    const m = new Gauge(name, help)
    this.metrics.push(m)
    return m
  }
  histogram(name: string, help: string, bounds: number[]) {
    check(name)
    const m = new Histogram(name, help, bounds)
    this.metrics.push(m)
    return m
  }
  /** Runs when the metrics are read, to refresh gauges (queue depth, process figures). */
  onCollect(fn: () => void | Promise<void>) {
    this.collectors.push(fn)
  }
  render() {
    return `${this.metrics.flatMap((m) => m.render()).join('\n')}\n`
  }
  async renderAsync() {
    for (const collect of this.collectors) await collect()
    return this.render()
  }
}

/** Request and job durations, in seconds. */
export const DURATION_BUCKETS = [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30]

/** Uptime and resident memory of the process, refreshed on every read. */
export function collectProcessMetrics(registry: MetricsRegistry) {
  const uptime = registry.gauge('process_uptime_seconds', 'Seconds since the process started')
  const memory = registry.gauge('process_resident_memory_bytes', 'Resident memory of the process')
  registry.onCollect(() => {
    uptime.replace([{ labels: {}, value: Math.round(process.uptime()) }])
    memory.replace([{ labels: {}, value: process.memoryUsage().rss }])
  })
}

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export function bearerMatches(header: string | null | undefined, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const digest = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(digest(header.slice(7)), digest(token))
}
