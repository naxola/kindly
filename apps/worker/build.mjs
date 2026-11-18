// Bundles the worker into a single ESM file. Workspace packages (TypeScript source) are
// included; npm dependencies stay external and are installed in the production image.
import { build } from 'esbuild'

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  plugins: [
    {
      name: 'externalize-npm',
      setup(b) {
        // Any bare import that is not from the monorepo is external.
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@saas/') ? undefined : { path: args.path, external: true },
        )
      },
    },
  ],
  logLevel: 'info',
})
