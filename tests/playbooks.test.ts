import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const NO_PR_TAIL = new Set(["investigation", "prototype", "pause-safely", "worktree-cleanup", "babysit", "opening-a-pr"]);

function routerSlugs(): string[] {
  const router = read("skills/resonator/SKILL.md");
  const section = router.split(/^## Playbooks$/m)[1]?.split(/^## /m)[0] ?? "";
  const slugs = [...section.matchAll(/^\|\s*([a-z][a-z-]*)\s*\|/gm)].map((m) => m[1]);
  assert.ok(slugs.length > 0, "router Playbooks section lists no slugs");
  return slugs;
}

test("playbook files match the router's slug list", () => {
  const files = readdirSync(new URL("skills/resonator/playbooks/", root))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3))
    .sort();
  assert.deepEqual(files, routerSlugs().sort());
});

test("every code playbook ends in opening-a-pr", () => {
  for (const slug of routerSlugs()) {
    if (NO_PR_TAIL.has(slug)) continue;
    const text = read(`skills/resonator/playbooks/${slug}.md`);
    assert.ok(text.includes("opening-a-pr"), `${slug}.md does not reference opening-a-pr`);
  }
});
