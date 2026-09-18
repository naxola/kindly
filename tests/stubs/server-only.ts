// Vitest runs under plain Node, not Next.js's RSC bundler, so the real
// `server-only` package (which unconditionally throws unless resolved
// through Next's "react-server" build condition) would break every test
// that imports a service module. vitest.config.mts aliases "server-only"
// to this no-op for tests only — the real package still guards the actual
// Next.js build/dev server, where the client/server boundary is what
// matters.
export {};
