import 'server-only'
import { collectProcessMetrics, DURATION_BUCKETS, MetricsRegistry } from '@saas/adapters/metrics'

/**
 * Metrics of this web process (ADR 0008, amendment). One registry per process, also across
 * reloads in development. Labels: method, route TEMPLATE and status class; never the real path
 * (it can carry ids or tokens) and never anything about the person.
 */
const globalForMetrics = globalThis as unknown as {
  __metrics?: ReturnType<typeof create>
}

function create() {
  const registry = new MetricsRegistry()
  collectProcessMetrics(registry)
  const requests = registry.counter('http_requests_total', 'API requests by route and status')
  const duration = registry.histogram(
    'http_request_duration_seconds',
    'Duration of API requests',
    DURATION_BUCKETS,
  )
  return { registry, requests, duration }
}

export const metrics = () => (globalForMetrics.__metrics ??= create())

export function recordRequest(method: string, route: string, status: number, seconds: number) {
  const { requests, duration } = metrics()
  const labels = { method, route, status: `${Math.floor(status / 100)}xx` }
  requests.inc(labels)
  duration.observe(labels, seconds)
}
