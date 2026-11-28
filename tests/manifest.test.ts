import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const readJson = (p: string) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const CAST = ["Jinhsi", "Phoebe", "Shorekeeper", "Encore", "Xiangli Yao", "Verina", "Zhezhi"];

test("plugin.json is valid", () => {
  const plugin = readJson(".claude-plugin/plugin.json");
  assert.equal(plugin.name, "resonator");
  assert.match(plugin.version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/);
  for (const name of CAST) assert.ok(!plugin.description.includes(name), `description mentions ${name}`);
});

test("marketplace.json lists resonator with source ./", () => {
  const mp = readJson(".claude-plugin/marketplace.json");
  assert.equal(mp.name, "resonator");
  assert.equal(mp.plugins.length, 1);
  assert.equal(mp.plugins[0].name, "resonator");
  assert.equal(mp.plugins[0].source, "./");
});
