import { createServer, type Server } from 'node:http'

/**
 * HTTP health of the worker, for Docker healthchecks and external monitors (ADR 0008).
 * /health: the process answers. /ready: the database and the queue answer.
 */
export function startHealthServer(port: number, ready: () => Promise<boolean>): Promise<Server> {
  const server = createServer((req, res) => {
    const reply = (status: number, body: object) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.url === '/health') return reply(200, { status: 'ok' })
    if (req.url === '/ready') {
      ready()
        .then((ok) => reply(ok ? 200 : 503, { status: ok ? 'ok' : 'fail' }))
        .catch(() => reply(503, { status: 'fail' }))
      return
    }
    reply(404, { status: 'not found' })
  })
  return new Promise((resolve) => server.listen(port, () => resolve(server)))
}

/**
 * Push heartbeat (Uptime Kuma "Push" monitor or any URL that expects a regular call): while
 * the worker is ready it calls the URL every interval; if the worker dies, hangs or loses
 * the database the calls stop and the monitor raises the alarm. Nothing to expose.
 * The URL carries the monitor token: it is never logged.
 */
export function startHeartbeat({
  url,
  intervalMs,
  ready,
  onError,
  fetchImpl = fetch,
}: {
  url: string
  intervalMs: number
  ready: () => Promise<boolean>
  onError: (reason: string) => void
  fetchImpl?: typeof fetch
}) {
  const beat = async () => {
    try {
      if (!(await ready())) return onError('not ready')
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) onError(`monitor answered ${res.status}`)
    } catch (err) {
      onError(err instanceof Error ? err.name : 'unknown error')
    }
  }
  void beat()
  const timer = setInterval(() => void beat(), intervalMs)
  timer.unref()
  return { beat, stop: () => clearInterval(timer) }
}
