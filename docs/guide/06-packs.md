# Stack packs

A pack holds framework or runtime facts and commands. The router detects packs at the start of every task and reads the matching skill before it touches framework or runtime code.

## Check what is detected

```
node <plugin root>/scripts/detect.ts
```

It prints a JSON array, for example `["nuxt","bun"]`.

## Available packs

| Pack | Read when |
|---|---|
| `pack-nuxt` | The project is a Nuxt app |
| `pack-node` | The project runs on Node.js |
| `pack-bun` | The project runs on Bun, including Elysia and Hono servers |

Packs combine. A Nuxt app also reads `pack-node` or `pack-bun` for its runtime.

## If your stack has no pack

The router proceeds without one. Run `/astack:correct` to turn repeated stack-specific mistakes into types, lints, or tests in your repo.
