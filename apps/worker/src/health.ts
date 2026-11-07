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
