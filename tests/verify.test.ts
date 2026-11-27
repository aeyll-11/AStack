import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routerPlaybookSlugs,
  missingPlaybooks,
  danglingSkillRefs,
  danglingAgentRefs,
  unknownModelRoles,
} from "../scripts/verify.ts";

const ROUTER = `## Playbooks

| Slug | For |
|---|---|
| feature | a feature |
| verina | a bug |

Other text | not | a row
`;

test("routerPlaybookSlugs reads the slug column of the Playbooks table", () => {
  assert.deepEqual(routerPlaybookSlugs(ROUTER), ["feature", "verina"]);
});

test("missingPlaybooks lists slugs with no file", () => {
  assert.deepEqual(missingPlaybooks(["feature", "verina"], new Set(["feature"])), ["verina"]);
  assert.deepEqual(missingPlaybooks(["feature"], new Set(["feature"])), []);
});

test("danglingSkillRefs flags **name** that matches no skill folder", () => {
  const files = [{ path: "a.md", text: "Run **tdd** then **ghost**. Also **Bold Phrase** and **pack-<p>**." }];
  assert.deepEqual(danglingSkillRefs(files, new Set(["tdd"])), ["a.md: **ghost**"]);
});

test("danglingSkillRefs accepts principle-* folders", () => {
  const files = [{ path: "a.md", text: "**principle-x** and **principle-y**" }];
  assert.deepEqual(danglingSkillRefs(files, new Set(["principle-x"])), ["a.md: **principle-y**"]);
});

test("danglingAgentRefs flags astack:<agent> with no agent file", () => {
  const files = [{ path: "a.md", text: 'subagent_type: "astack:zhezhi" and astack:nobody and /astack:tdd' }];
  assert.deepEqual(danglingAgentRefs(files, new Set(["zhezhi"]), new Set()), ["a.md: astack:nobody"]);
  const labels = [{ path: "b.md", text: "label `astack:needs-info`" }];
  assert.deepEqual(danglingAgentRefs(labels, new Set(), new Set(["needs-info"])), []);
});

test("unknownModelRoles flags roles outside ROLES", () => {
  const files = [{ path: "a.md", text: "`config.ts model lead` and `config.ts model wizard`" }];
  assert.deepEqual(unknownModelRoles(files, ["lead"]), ["a.md: wizard"]);
});

test("danglingSkillRefs accepts playbook and agent names and ignores status words", () => {
  const files = [{ path: "a.md", text: "**feature** **zhezhi** **blocked**" }];
  assert.deepEqual(danglingSkillRefs(files, new Set(["feature", "zhezhi"])), []);
});
