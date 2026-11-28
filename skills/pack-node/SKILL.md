---
name: pack-node
description: Resonator stack pack for Node.js projects. Read when the router detects node.
disable-model-invocation: true
---

# Node pack

Facts here match the Node.js API docs (nodejs.org/api). Flags note the version that made them stable. Check the project's `engines.node` before you use one.

Packs combine. A Nuxt app on Node reads **pack-nuxt** too. A Bun project gets **pack-bun** instead of this pack. In a monorepo both can be active: apply each to the packages that use that runtime.

## Conventions

- **Async errors.** Every promise is awaited, returned, or handed to something that handles its rejection. Since Node 15, an unhandled rejection crashes the process by default (`--unhandled-rejections=throw`).
- **Process-level handlers log and exit.** `process.on('unhandledRejection')` and `process.on('uncaughtException')` are for a last log line and a non-zero exit. Never use them to keep serving.
- **Streams.** Connect streams with `pipeline` from `node:stream/promises`. It forwards errors, destroys every stream on failure, and resolves when done. Use `for await` over a readable for simple consumption.
- **Backpressure.** `writable.write()` returns `false` once the buffer reaches `highWaterMark`. Stop writing and wait for `'drain'`. `pipeline` does this for you.
- **Graceful shutdown.** On SIGTERM and SIGINT: stop accepting work, finish in-flight requests, close pools, then exit. Set a hard deadline so a stuck connection cannot block exit.
- **Env at the boundary.** Read `process.env` once, in one module, at startup. Parse it into a typed, frozen config object. Fail fast on a missing or malformed value. The rest of the code imports the config, never `process.env`.
- **Loading `.env`.** `node --env-file=.env` loads a file. Real environment variables take precedence over the file. `process.loadEnvFile()` and `util.parseEnv()` do it in code. All three are stable from Node 24.10 and 22.21.
- **CLI args.** Use `util.parseArgs` from `node:util`.
- **TypeScript without a build.** Node strips types by default from 22.18 and 23.6. It runs only erasable syntax: no `enum`, no parameter properties, no `namespace` with runtime code. Imports need the `.ts` extension. Node ignores `tsconfig.json`.

```ts
// src/config.ts
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing env var ${name}`)
  return value
}

const port = Number(process.env.PORT ?? '3000')
if (!Number.isInteger(port)) throw new Error(`PORT is not an integer: ${process.env.PORT}`)

export const config = Object.freeze({ port, databaseUrl: required('DATABASE_URL') })
```

```ts
// src/server.ts: graceful shutdown
const server = createApp().listen(config.port)

function shutdown(signal: string): void {
  console.log(`${signal}: closing`)
  server.close(() => process.exit(0))
  setTimeout(() => {
    server.closeAllConnections()
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

## Pitfalls

- **Floating promise.** `doWork()` without `await` in a request handler. The handler returns before the work fails, and the rejection crashes the process.
- **`.pipe()` leaks.** If the source errors, `.pipe()` does not close the destination. Use `pipeline`.
- **Ignoring `write()`'s return value.** Memory grows without bound under a slow consumer.
- **Signal listeners replace the default.** Once you listen for SIGTERM or SIGINT, Node no longer exits on it. Your handler must exit.
- **`server.close()` waits.** It stops new connections and closes idle ones, then waits for in-flight requests. Call `server.closeAllConnections()` after `close()` to force the rest. It does not close upgraded sockets such as WebSockets.
- **Sync work on the request path.** `fs.*Sync`, sync crypto, or a large `JSON.parse` blocks every other request.
- **Scattered `process.env` reads.** A typo becomes `undefined` at request time, not at startup.
- **`--env-file` and `NODE_OPTIONS`.** `--env-file` applies Node's own variables, such as `NODE_OPTIONS`, from the file. `process.loadEnvFile()` does not.

## Testing

- **`node:test`.** `node --test` finds files such as `**/*.test.{js,mjs,cjs}` and `**/test/**/*.{js,mjs,cjs}`, plus the same patterns for `.ts`, `.mts`, and `.cts` while type stripping is on. Pass quoted globs to narrow: `node --test "src/**/*.test.ts"`.
- **Mocks.** `import { mock, test } from 'node:test'`. `mock.fn()` makes a spy. `mock.method(obj, 'name')` replaces a method. `mock.timers` fakes timers.
- **Useful flags.** `--test-name-pattern`, `--test-only`, `--watch`, and `--test-reporter`.
- **Vitest.** Run `vitest run` in automation. Plain `vitest` starts watch mode in an interactive terminal and falls back to a single run in CI or without a TTY.
- **HTTP handlers.** Start the server on port `0` in the test, wait for `'listening'`, read the chosen port from `server.address()`, and call it with `fetch`. Close it in `after`.

```ts
// src/orders.test.ts
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, test } from 'node:test'
import { createApp } from './app.ts'

const server = createApp().listen(0)
let base = ''
before(async () => {
  await once(server, 'listening')
  const addr = server.address()
  if (addr === null || typeof addr === 'string') throw new Error('expected a TCP address')
  base = `http://127.0.0.1:${addr.port}`
})
after(() => { server.close() })

test('GET /orders/1 returns the order', async () => {
  const res = await fetch(`${base}/orders/1`)
  assert.equal(res.status, 200)
})
```

## Dev-server & verification recipe

- **Command.** The project's `dev` script, else `start`. Read `package.json` first. A plain entry runs as `node --watch src/server.ts`. `--watch` restarts on changes to the entry and its imports.
- **Default port.** Node has none. The app picks it, usually from `PORT`. Find the `listen(` call and the env var it reads.
- **Custom port.** Set the env var the app reads (`PORT=<port>`). If the script hard-codes a port or takes a flag, pass that instead.
- **Ready path.** A health route if the app has one (`/health`, `/healthz`, `/api/health`). Otherwise `/`. Any status below 500 means it is up.
- **Stop.** Send SIGTERM to the process you started and to its children. Then kill the port's listener. A server with the shutdown handler above exits within its deadline.

## Profiling

- **CPU.** `node --cpu-prof <entry>` writes a `.cpuprofile` to the working directory when the process exits. `--cpu-prof-dir` and `--cpu-prof-name` set where. Stable from Node 22.4. Open it in Chrome DevTools or VS Code.
- **Profile through a script.** `NODE_OPTIONS=--cpu-prof npm run start`. Every Node process that inherits it writes its own file, the package manager included. Pick the server's by pid.
- **Exit cleanly.** The profile is written on exit. Stop the server with SIGTERM and let the handler call `process.exit`.
- **Heap allocation.** `node --heap-prof <entry>` writes a `.heapprofile` on exit. Same `-dir` and `-name` flags.
- **Heap snapshot.** Start with `node --heapsnapshot-signal=SIGUSR2 <entry>`, then `kill -USR2 <pid>`. It writes a `.heapsnapshot` to the working directory. Take one before and one after the suspect load, and diff them in DevTools Memory. In code, call `v8.writeHeapSnapshot()`. `--heapsnapshot-near-heap-limit=<n>` catches an out-of-memory crash.
- **Live.** `node --inspect <entry>` opens the inspector at `127.0.0.1:9229`. Attach from `chrome://inspect` and use the Performance and Memory panels.
