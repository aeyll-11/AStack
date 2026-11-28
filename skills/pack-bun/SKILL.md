---
name: pack-bun
description: Resonator stack pack for Bun projects, including Elysia and Hono servers. Read when the router detects bun.
disable-model-invocation: true
---

# Bun pack

Facts here match the Bun docs (bun.com/docs), the Elysia docs (elysiajs.com), and the Hono docs (hono.dev). Where a feature needs a minimum Bun version, it is named.

Packs combine. A Nuxt app on Bun reads **pack-nuxt** too. This file overrides its commands for Bun. A Bun project gets this pack instead of **pack-node**. Node advice on async errors, env parsing, and graceful shutdown still applies here.

## Conventions

- **`Bun.serve`.** Declare `routes` for static, dynamic (`/users/:id`), and per-method handlers. Keep `fetch` as the fallback for unmatched requests. `routes` needs Bun 1.2.3 or later.
- **Default export.** A file whose default export has a `fetch` handler is passed to `Bun.serve` when you run it. That is how `export default app` starts a Hono server.
- **Port.** `Bun.serve` uses its `port` option. Without one it reads `BUN_PORT`, then `PORT`, then `NODE_PORT`, else 3000. `port: 0` picks a free port. Read it back from `server.port` or `server.url`.
- **Graceful shutdown.** `await server.stop()` lets in-flight requests and WebSockets finish and closes idle keep-alive connections. `server.stop(true)` closes everything now.
- **Scripts.** The form is `bun [bun flags] run <script> [script flags]`. Bun flags go before `run`. Flags after the script name go to the script.
- **`--bun`.** `bun run` respects a `#!/usr/bin/env node` shebang and runs that tool on Node. `bun --bun run <script>` runs it on Bun instead. The `nuxt` CLI runs on Node unless you pass `--bun`.
- **Env.** Bun loads `.env`, `.env.<NODE_ENV>`, and `.env.local` automatically. `.env.local` is skipped when `NODE_ENV=test`. Under `--bun` Bun acts as `node` and skips automatic loading. Parse env into one typed config at startup, as in **pack-node**.
- **Elysia.** `new Elysia().get('/', () => 'hi').listen(port)`. Lifecycle hooks are local to their instance by default. Use `{ as: 'scoped' }` to reach the parent, or `{ as: 'global' }` for every instance. Give a shared plugin a `name` so it is applied once.
- **Hono.** Default-export the app, or `export default { port, fetch: app.fetch }` to set the port in code. A typical dev script is `bun run --hot src/index.ts`.

```ts
// src/server.ts
const server = Bun.serve({
  routes: {
    '/health': new Response('ok'),
    '/api/orders/:id': {
      GET: (req) => Response.json(loadOrder(Number(req.params.id))),
    },
  },
  fetch: () => new Response('Not Found', { status: 404 }),
})

process.on('SIGTERM', async () => {
  await server.stop()
  process.exit(0)
})
```

## Pitfalls

- **Idle timeout.** `Bun.serve` closes a connection after 10 seconds with no bytes sent. A slow handler that has not started its response gets a reset. Raise `idleTimeout` (seconds, max 255), or call `server.timeout(req, 0)` for one long stream such as SSE.
- **`bun test` vs `bun run test`.** `bun test` is Bun's runner, not the project's `test` script. It also picks up every `*.spec.ts` and `*.test.ts`, including Playwright and Vitest files. When the project tests with Vitest or Playwright, run `bun run test`.
- **Script on the wrong runtime.** Without `--bun`, a CLI with a node shebang runs on Node. A bug that only shows under Bun needs `bun --bun run <script>` to reproduce.
- **`--watch` vs `--hot`.** `--watch` restarts the process and sends SIGTERM to your handlers first. `--hot` re-evaluates the files in the same process, and `globalThis` persists. State kept on `globalThis` survives a reload. Restart before you trust a result that depends on startup.
- **Node-compat gaps that bite.** Bun's compatibility page lists these against Node 26:
  - `node:test`: no `node --test` runner mode, no `mock.module()`, no snapshots. Use `bun:test`.
  - `node:v8`: no `startCpuProfile` or `startHeapProfile`. Heap statistics describe JavaScriptCore.
  - `node:async_hooks`: `AsyncLocalStorage` works. `createHook` is a stub and never fires.
  - `node:crypto`: BoringSSL. No `secp256k1` curve and no `chacha20-poly1305` cipher.
  - `node:https` server: `req.socket.getPeerCertificate()` is missing, and there is no `SNICallback`.
  - `console` writes straight to the file descriptors. Replacing `process.stdout.write` does not capture it.
  - `process.getActiveResourcesInfo()` always returns an empty array. Leak hunts that rely on it see nothing.
  - No `localStorage` or `sessionStorage` globals.
- **Bug reports.** Bun treats "works in Node, fails in Bun" as a Bun bug. Confirm on Node before you work around it.

## Testing

- **Runner.** `import { describe, expect, it, mock } from 'bun:test'`. The API is Jest-like.
- **Discovery.** `*.test.*`, `*_test.*`, `*.spec.*`, and `*_spec.*` with any JS or TS extension. It skips `node_modules` and hidden directories.
- **Filters.** `bun test utils` runs files whose path contains `utils`, a substring and not a glob. Start an exact path with `./`. `-t <regex>` filters by test name.
- **Isolation.** All files run in one process with one shared global by default. `--parallel` spreads files across cores. Reset module-level state in `beforeEach`.
- **Timeout.** 5000 ms per test by default. Change it with `--timeout <ms>` or a third argument to `test`.
- **Watch.** `bun --watch test`.
- **HTTP handlers without a server.** Hono: `await app.request('/posts')`. Elysia: `await app.handle(new Request('http://localhost/'))`. Elysia needs a full URL.

```ts
// src/app.test.ts
import { expect, it } from 'bun:test'
import app from './app.ts'

it('GET /health returns ok', async () => {
  const res = await app.request('/health')
  expect(res.status).toBe(200)
})
```

## Dev-server & verification recipe

- **Command.** The project's `dev` script through `bun run dev`. For a Nuxt app use `bun --bun run dev` so the server runs on Bun, the runtime it ships on.
- **Default port.** 3000 for `Bun.serve` and Hono when the code sets no port. Elysia uses the port passed to `.listen()`. Nuxt uses 3000.
- **Custom port.** If the code sets no port, set `BUN_PORT=<port> PORT=<port>`. `BUN_PORT` wins over `PORT`, so set both. If the code hard-codes `port`, find what it reads. For Nuxt, pass the flag after the script: `bun --bun run dev --port <port> --strictPort`.
- **Ready path.** A health route if one exists, else `/`.
- **Stop.** Send SIGTERM to the process you started and to its children. Then kill the port's listener. A server with the shutdown handler above drains first.
- **Production Nuxt on Bun.** Build with the Nitro `bun` preset. Then run `bun run ./.output/server/index.mjs`.

## Profiling

- **CPU.** `bun --cpu-prof <entry>` writes a `.cpuprofile` on exit. Open it in Chrome DevTools or VS Code. `--cpu-prof-md` writes a Markdown profile you can grep. `--cpu-prof-dir` and `--cpu-prof-name` set where. `bun test --cpu-prof` profiles tests.
- **Flags through an env var.** `BUN_OPTIONS="--cpu-prof-md" bun <entry>` passes Bun flags without editing the command.
- **Heap.** `bun --heap-prof <entry>` writes a full V8-format heap snapshot on exit, named `.heapprofile`. This differs from Node's sampling profile. Load it in DevTools Memory with "All Files", or rename it to `.heapsnapshot`.
- **Heap snapshot in code.** `v8.writeHeapSnapshot()` from `node:v8` writes a file Chrome DevTools opens. `Bun.generateHeapSnapshot()` returns Bun's own format, which opens in Safari's Web Inspector.
- **Live.** `bun --inspect <entry>` prints a `ws://` URL and a `debug.bun.sh` link. `--inspect-brk` stops on the first line. `--inspect-wait` waits for a debugger. `--inspect=localhost:4000` sets the address.
