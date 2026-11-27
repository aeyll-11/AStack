---
name: pack-nuxt
description: AStack stack pack for Nuxt apps. Read when the router detects nuxt.
disable-model-invocation: true
---

# Nuxt pack

Facts here match the Nuxt 4 docs (nuxt.com/docs/4.x). On an older major, check the project's docs before you apply one.

Packs combine. A Nuxt app also gets **pack-node** or **pack-bun** for its runtime. Read both. This file names the package-manager-neutral command. **pack-bun** says how it changes under Bun.

## Conventions

- **Server routes.** Files in `server/api/` are served under `/api`. Files in `server/routes/` get no prefix. `server/middleware/` runs on every request. Each file default-exports `defineEventHandler((event) => ...)`.
- **Method suffix.** `server/api/orders.get.ts` and `orders.post.ts` split handlers by method. `readBody` in a GET handler throws 405.
- **h3 helpers.** Read input with `getRouterParam`, `getQuery`, `readBody`, or `readValidatedBody` with a schema. Validate at the handler. Throw `createError({ status: 400, statusText: '...' })` for client errors. An uncaught error returns 500.
- **Data fetching in components.** `useFetch` and `useAsyncData` run on the server and forward the result to the client in the payload. The client does not fetch again during hydration.
- **`$fetch`.** Use it for event-driven calls (a click, a form submit) and inside `useAsyncData`. A bare `$fetch` in `<script setup>` fetches twice: once on the server and again on the client.
- **Keys.** Give `useAsyncData` an explicit string key, such as `` `user:${id}` ``. The generated key depends only on the call site, so a shared composable gets the wrong cache.
- **Composable context.** Call `useFetch` and other Nuxt composables in setup, a plugin, or route middleware, synchronously. After an `await` they lose context, except in `<script setup>`, `defineNuxtPlugin`, `defineNuxtRouteMiddleware`, and `defineNuxtComponent`.
- **Auto-imports.** Nuxt auto-imports `app/components/`, `app/composables/`, and `app/utils/`. In `server/`, it auto-imports `server/utils/`. Only top-level files in `app/composables/` are scanned. Re-export nested ones from an index. Use `#imports` for an explicit import.
- **Runtime config.** Declare every key in `nuxt.config` under `runtimeConfig`. Keys under `runtimeConfig.public` reach the browser. Everything else stays on the server.
- **Env overrides.** `NUXT_API_SECRET` overrides `runtimeConfig.apiSecret`. `NUXT_PUBLIC_API_BASE` overrides `runtimeConfig.public.apiBase`. An undeclared key is not read.
- **Reading config.** In a server route, call `useRuntimeConfig(event)` so runtime env overrides apply. In components, call `useRuntimeConfig()`.

```ts
// server/api/orders/[id].get.ts
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ status: 400, statusText: 'id must be an integer' })
  const { apiSecret } = useRuntimeConfig(event)
  return loadOrder(id, apiSecret)
})
```

## Pitfalls

- **Secrets in `nuxt.config`.** Values written there, including `process.env` reads, end up in the server build output. Leave private values empty and set them with `NUXT_` env vars.
- **Secret under `public`.** Anything in `runtimeConfig.public` is in every page payload. Review each new public key.
- **Env value types.** Nuxt casts env values. `NUXT_MY_VAR=4848e0` becomes the number `4848`. Quote the value (`'"4848e0"'`) to keep a string.
- **Hydration mismatch.** The server HTML and the first client render differ. The dev console warns. Common causes:
  - browser-only APIs in setup (`localStorage`, `window`): use `useCookie`, or move the code into `onMounted` or `<ClientOnly>`
  - random values: create them once with `useState('key', () => Math.random())`
  - time: `new Date()` differs between server and client. Use `<NuxtTime>` or `<ClientOnly>`
  - branching on window size or other client-only state in the template
- **Double fetch.** A bare `$fetch` in setup. Wrap it in `useAsyncData`.
- **Shared `useFetch` data.** Two `useFetch` calls with the same URL in different components make two requests. Pass the same `key` to share.
- **Large payloads.** Everything `useFetch` returns is serialized into the HTML. Trim it with `pick` or `transform`. Both still fetch the full response.
- **`server: false`.** The data is `undefined` in `<script setup>` until hydration ends, even when awaited.

## Testing

- **Install.** `@nuxt/test-utils`, `vitest`, `@vue/test-utils`, `happy-dom`, and `playwright-core` as dev dependencies.
- **Two environments.** The `nuxt` environment runs a Nuxt app in happy-dom or jsdom with auto-imports and plugins. The `node` environment runs plain Node and end-to-end tests. One file runs in one environment. Never mix `@nuxt/test-utils/runtime` and `@nuxt/test-utils/e2e` in one file.
- **Config.** Use Vitest projects. Wrap the Nuxt project in `defineVitestProject` from `@nuxt/test-utils/config` with `environment: 'nuxt'`. Configure e2e as a plain `environment: 'node'` project. Choose the environment with `include` globs, not a `// @vitest-environment` comment.
- **Runtime helpers** (from `@nuxt/test-utils/runtime`):
  - `mountSuspended(Component, { route })` mounts with async setup and plugin injections.
  - `mockNuxtImport('useState', ...)` mocks an auto-import. Once per import per file. It hoists like `vi.mock`, so use `vi.hoisted` to vary it per test.
  - `registerEndpoint` serves mock data from a fake Nitro endpoint.
- **End to end** (from `@nuxt/test-utils/e2e`). `await setup({ rootDir })` in each `describe`. Then use `$fetch('/api/...')` for HTTP and `createPage('/path')` for a Playwright page. `createPage` waits for hydration. On later navigations, call `page.goto(url('/next'), { waitUntil: 'hydration' })`.
- **Playwright Test runner.** Import `test` and `expect` from `@nuxt/test-utils/playwright`. Use `goto('/', { waitUntil: 'hydration' })` before you act. Clicking before hydration ends hits a page with no handlers.
- **Env for tests.** Put test env vars in `.env.test`.

```ts
// test/nuxt/OrderCard.nuxt.spec.ts
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { expect, it } from 'vitest'
import OrderCard from '~/components/OrderCard.vue'

it('shows the order total', async () => {
  const card = await mountSuspended(OrderCard, { props: { total: 42 } })
  expect(card.text()).toContain('42')
})
```

## Dev-server & verification recipe

- **Command.** The project's `dev` script, which runs `nuxt dev`. Use the project's package manager: `npm run dev`, `pnpm dev`, `yarn dev`. Under Bun, see **pack-bun**.
- **Default port.** 3000.
- **Custom port.** Pass `--port <port>` (`npm run dev -- --port <port>`). Port precedence is `NUXT_PORT`, then `NITRO_PORT`, then `PORT`. A stray `NUXT_PORT` in the shell beats `PORT`, so always pass the flag. Add `--strictPort` so Nuxt exits instead of moving to another port.
- **Ready path.** `/`. It server-renders the root page.
- **One server per project.** `nuxt dev` records itself in `nuxt.lock` in `.nuxt/`. A second `nuxt dev` in the same directory reports the running one. Never pass `--takeover`. It stops the user's server. Run verification from a worktree.
- **Stop.** Send SIGTERM to the process you started and to its children. By default `nuxt dev` serves from a forked child where the runtime supports it, and that child holds the port. Kill the port's listener after the parent. `--no-fork` keeps it in one process.
- **Production check.** `nuxt build`, then `node .output/server/index.mjs`. It reads `NITRO_PORT` or `PORT` and defaults to 3000.

## Profiling

- **Dev CPU profile.** `nuxt dev --profile` writes `nuxt-dev.cpuprofile` in the project root when the process exits. `--profile=verbose` also prints a report. The build timing reports need Nuxt 4.4 or later.
- **Debug server code.** `nuxt dev --inspect` opens the inspector at `127.0.0.1:9229` for server routes, middleware, and SSR. They run in a Nitro worker thread. `nuxt.config`, modules, and build hooks run in the CLI process on the next port (9230).
- **Production CPU or heap.** Build, then profile `.output/server/index.mjs` with the runtime pack's recipe (`node --cpu-prof`, or the Bun equivalent).
- **Page cost.** Use the perf playbook's Playwright trace and Lighthouse runs against the running server. Check payload size in the HTML before you optimize the render.
