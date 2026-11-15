import { describe, expect, it } from 'vitest'
import { MetricsRegistry, bearerMatches } from '../src/metrics/index.ts'

describe('MetricsRegistry', () => {
  it('renders counters with sorted labels and escaped values', () => {
    const m = new MetricsRegistry()
    const c = m.counter('requests_total', 'Requests')
    c.inc({ route: '/a', method: 'GET' })
    c.inc({ route: '/a', method: 'GET' }, 2)
    c.inc({ route: '/b "x"\n', method: 'POST' })
    const out = m.render()
    expect(out).toContain('# HELP requests_total Requests')
    expect(out).toContain('# TYPE requests_total counter')
    expect(out).toContain('requests_total{method="GET",route="/a"} 3')
    expect(out).toContain('requests_total{method="POST",route="/b \\"x\\"\\n"} 1')
  })

  it('renders a histogram with cumulative buckets, sum and count', () => {
    const m = new MetricsRegistry()
    const h = m.histogram('latency_seconds', 'Latency', [0.1, 1])
    h.observe({ route: '/a' }, 0.05)
    h.observe({ route: '/a' }, 0.5)
    h.observe({ route: '/a' }, 5)
    const out = m.render()
    expect(out).toContain('latency_seconds_bucket{route="/a",le="0.1"} 1')
    expect(out).toContain('latency_seconds_bucket{route="/a",le="1"} 2')
    expect(out).toContain('latency_seconds_bucket{route="/a",le="+Inf"} 3')
    expect(out).toContain('latency_seconds_sum{route="/a"} 5.55')
    expect(out).toContain('latency_seconds_count{route="/a"} 3')
  })

  it('renders gauges, and replaces the whole set when it is set again', () => {
    const m = new MetricsRegistry()
    const g = m.gauge('queue_depth', 'Depth')
    g.replace([
      { labels: { queue: 'a', state: 'created' }, value: 4 },
      { labels: { queue: 'b', state: 'active' }, value: 0 },
    ])
    expect(m.render()).toContain('queue_depth{queue="a",state="created"} 4')
    g.replace([{ labels: { queue: 'a', state: 'created' }, value: 1 }])
    const out = m.render()
    expect(out).toContain('queue_depth{queue="a",state="created"} 1')
    expect(out).not.toContain('queue="b"')
  })

  it('refuses a name or label that is not a valid metric identifier', () => {
    const m = new MetricsRegistry()
    expect(() => m.counter('bad name', 'x')).toThrow()
    const c = m.counter('ok_total', 'x')
    expect(() => c.inc({ 'bad-label': 'v' })).toThrow()
  })

  it('collects values at render time (process metrics, queue snapshots)', async () => {
    const m = new MetricsRegistry()
    const g = m.gauge('depth', 'Depth')
    m.onCollect(() => g.replace([{ labels: {}, value: 7 }]))
    expect(await m.renderAsync()).toContain('depth 7')
  })
})

describe('bearerMatches', () => {
  it('accepts only the exact token, in a Bearer header', () => {
    expect(bearerMatches('Bearer s3cret-token-value', 's3cret-token-value')).toBe(true)
    expect(bearerMatches('Bearer s3cret-token-valuX', 's3cret-token-value')).toBe(false)
    expect(bearerMatches('Bearer short', 's3cret-token-value')).toBe(false)
    expect(bearerMatches('s3cret-token-value', 's3cret-token-value')).toBe(false)
    expect(bearerMatches(null, 's3cret-token-value')).toBe(false)
  })
})
