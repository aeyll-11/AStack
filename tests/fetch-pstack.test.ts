import { test } from "node:test";
import assert from "node:assert/strict";
import { pathsUnderPrefix } from "../scripts/dev/fetch-pstack.ts";

test("pathsUnderPrefix keeps blobs under the prefix, relative to pstack/", () => {
  const tree = [
    { path: "pstack/skills/principle-a/SKILL.md", type: "blob" },
    { path: "pstack/skills/principle-a", type: "tree" },
    { path: "pstack/skills/other/SKILL.md", type: "blob" },
    { path: "README.md", type: "blob" },
  ];
  assert.deepEqual(pathsUnderPrefix(tree, "skills/principle-"), ["skills/principle-a/SKILL.md"]);
});
