import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { main } from "../../scripts/watch-pr/cli.ts";
import type { GitHubReader } from "../../scripts/watch-pr/types.ts";
import {
  type FakeReaderOptions,
  failedCheck,
  fakeReader,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";

const CLI = join(import.meta.dirname, "../../scripts/watch-pr/cli.ts");
const ARGS = ["7", "--owner", "owner", "--repo", "repo", "--once", "--json"];

async function summary(reader: GitHubReader) {
  const stdout: string[] = [];
  const code = await main(ARGS, {
    reader,
    clock: {
      now: () => 0,
      observedAt: () => "2026-11-27T00:00:00.000Z",
      async sleep() {
        throw new Error("--json must not poll");
      },
    },
    stdout: (value) => stdout.push(value),
    stderr: () => {},
  });
  assert.equal(code, 0);
  assert.equal(stdout.length, 1);
  return JSON.parse(stdout[0]);
}
const read = (options: FakeReaderOptions) => summary(fakeReader(options));
const thread = {
  id: "t1",
  firstComment: { authorLogin: "alice", body: "nit", path: "a.ts", line: 3, createdAt: "now" },
};

describe("--once --json summary", () => {
  it("SUCCESS + CLEAN is green", async () => {
    assert.deepEqual(
      await read({
        facts: { mergeStateStatus: "CLEAN" },
        fastPath: { kind: "checks", checks: [passingCheck("build")] },
        commitRollups: [{ oid: "head", state: "SUCCESS" }],
      }),
      { state: "green", head: "head", failing: [], unresolvedThreads: 0 }
    );
  });

  it("a draft with passing checks is green", async () => {
    assert.equal(
      (await read({ facts: { isDraft: true, mergeStateStatus: "DRAFT" } })).state,
      "green"
    );
  });

  it("FAILURE is red and names each failing check with its link", async () => {
    const lint = { ...failedCheck("lint"), link: "https://github.com/owner/repo/actions/runs/9/job/1" };
    assert.deepEqual(
      await read({
        fastPath: { kind: "checks", checks: [passingCheck("build"), lint, pendingCheck("e2e")] },
        commitRollups: [{ oid: "head", state: "FAILURE" }],
      }),
      {
        state: "red",
        head: "head",
        failing: [{ name: "lint", link: "https://github.com/owner/repo/actions/runs/9/job/1" }],
        unresolvedThreads: 0,
      }
    );
  });

  it("a rollup ERROR behind a BLOCKED merge state is red", async () => {
    assert.equal(
      (await read({
        facts: { mergeStateStatus: "BLOCKED" },
        commitRollups: [{ oid: "head", state: "ERROR" }],
      })).state,
      "red"
    );
  });

  it("CONFLICTING is conflict, ahead of red CI", async () => {
    assert.equal(
      (await read({
        facts: { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" },
        fastPath: { kind: "checks", checks: [failedCheck("lint")] },
      })).state,
      "conflict"
    );
  });

  it("PENDING and EXPECTED are pending", async () => {
    assert.deepEqual(
      await read({ fastPath: { kind: "checks", checks: [passingCheck(), pendingCheck("e2e")] } }),
      { state: "pending", head: "head", failing: [], unresolvedThreads: 0 }
    );
    assert.equal(
      (await read({
        fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
        rollupPages: [{ checks: [{ ...pendingCheck("deploy-preview"), reportedState: "EXPECTED" }], endCursor: null }],
      })).state,
      "pending"
    );
  });

  it("reports the head the summary was read from", async () => {
    assert.equal((await read({ facts: { headRefOid: "abc123" }, commitRollups: [{ oid: "abc123", state: "SUCCESS" }] })).head, "abc123");
    assert.equal((await read({ facts: { headRefOid: null } })).head, null);
  });

  it("UNKNOWN mergeable is pending, not green", async () => {
    assert.equal((await read({ facts: { mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" } })).state, "pending");
  });

  it("a head with no rollup yet is never green", async () => {
    // Just after a push: gh pr checks still shows the old head passing.
    const stale = { facts: { headRefOid: "new" }, commitRollups: [{ oid: "old", state: "SUCCESS" as const }] };
    assert.equal((await read(stale)).state, "pending");
    assert.equal((await read({ ...stale, commitRollups: [{ oid: "new", state: null }] })).state, "pending");
    assert.equal((await read({ facts: { headRefOid: null } })).state, "pending");
  });

  it("CLOSED and MERGED are closed", async () => {
    assert.deepEqual(await read({ facts: { state: "CLOSED" } }), {
      state: "closed",
      head: "head",
      failing: [],
      unresolvedThreads: 0,
    });
    assert.equal(
      (await read({ facts: { state: "MERGED", mergedAt: "2026-11-27T00:00:00Z" } })).state,
      "closed"
    );
  });

  it("counts unresolved review threads without blocking green", async () => {
    assert.deepEqual(await read({ threads: [thread, { ...thread, id: "t2" }] }), {
      state: "green",
      head: "head",
      failing: [],
      unresolvedThreads: 2,
    });
  });
});

describe("GitHub unavailable", () => {
  const cli = (gh: string) =>
    spawnSync(process.execPath, [CLI, ...ARGS], {
      encoding: "utf8",
      timeout: 10_000,
      env: { ...process.env, ASTACK_GH: gh },
    });

  it("exits 2 when gh is missing", () => {
    const child = cli(join(tmpdir(), "astack-no-such-gh", "gh"));
    assert.equal(child.status, 2, child.stderr);
    assert.match(child.stderr, /^astack: GitHub unavailable: gh not found/);
    assert.equal(child.stdout, "");
  });

  it("exits 2 when gh is not authenticated", () => {
    const directory = mkdtempSync(join(tmpdir(), "watch-pr-noauth-"));
    try {
      const gh = join(directory, "gh");
      writeFileSync(
        gh,
        "#!/bin/sh\necho 'To get started with GitHub CLI, please run:  gh auth login' >&2\nexit 4\n",
        { mode: 0o755 }
      );
      const child = cli(gh);
      assert.equal(child.status, 2, child.stderr);
      assert.match(child.stderr, /^astack: GitHub unavailable: gh is not authenticated/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
