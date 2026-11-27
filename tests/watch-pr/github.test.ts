import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChecksUnavailable,
  WatcherQueryError,
  buildReviewThreads,
  mapRollupNode,
  orderStack,
  parseFastCheck,
  parsePullRequest,
  parseReviewThreadPage,
  resolveChecks,
  resolveContext,
  resolveReviewThreads,
} from "../../scripts/watch-pr/github.ts";
import {
  fakeReader,
  failedCheck,
  passingCheck,
  pendingCheck,
  matches,
} from "./fakes.test-helper.ts";
import { parsePrNumber } from "../../scripts/watch-pr/types.ts";

const context = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(42),
};

describe("checks fallback chain", () => {
  it("uses a non-empty fast-path result without a rollup query", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [passingCheck("fast")] },
    });
    const read = await resolveChecks(reader, context);
    assert.equal(read.source, "gh-pr-checks");
    assert.deepEqual(read.checks.map((check) => check.name), ["fast"]);
    assert.deepEqual(reader.calls, ["checksFastPath"]);
  });

  it("paginates GraphQL when the fast path is unusable", async () => {
    const reader = fakeReader({
      fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
      rollupPages: [
        { checks: [passingCheck("first")], endCursor: "next" },
        { checks: [failedCheck("second")], endCursor: null },
      ],
    });
    const read = await resolveChecks(reader, context);
    assert.equal(read.source, "graphql-rollup");
    assert.deepEqual(read.checks.map((check) => check.name), ["first", "second"]);
    assert.deepEqual(reader.calls, [
      "checksFastPath",
      "checkRollupPage:null",
      "checkRollupPage:next",
    ]);
  });

  it("falls back when valid fast-path JSON represented an empty list", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [] },
      rollupPages: [{ checks: [pendingCheck("fallback")], endCursor: null }],
    });
    assert.equal((await resolveChecks(reader, context)).checks[0].name, 
      "fallback"
    );
    assert.deepEqual(reader.calls, ["checksFastPath", "checkRollupPage:null"]);
  });

  it("fails closed when both paths are empty", async () => {
    const reader = fakeReader({
      fastPath: {
        kind: "unusable",
        exitCode: 8,
        stderr: "credential cannot read checks",
      },
    });
    await assert.rejects(resolveChecks(reader, context), 
      ChecksUnavailable
    );
    assert.deepEqual(reader.calls, ["checksFastPath", "checkRollupPage:null"]);
  });
});

describe("rollup node mapping", () => {
  it("maps terminal and non-terminal CheckRun states fail closed", () => {
    const cases = [
      ["IN_PROGRESS", null, "pending", "PENDING"],
      ["COMPLETED", "SUCCESS", "passed", "SUCCESS"],
      ["COMPLETED", "NEUTRAL", "skipped", "NEUTRAL"],
      ["COMPLETED", "SKIPPED", "skipped", "SKIPPED"],
      ["COMPLETED", "ACTION_REQUIRED", "failed", "ACTION_REQUIRED"],
      ["COMPLETED", "TIMED_OUT", "failed", "FAILURE"],
      ["COMPLETED", "FUTURE_VALUE", "failed", "FAILURE"],
    ] as const;
    for (const [status, conclusion, kind, reportedState] of cases) {
      matches(mapRollupNode({
          __typename: "CheckRun",
          name: "ci",
          status,
          conclusion,
        }), { kind, reportedState });
    }
  });

  it("classifies an in-progress Code Review Gate from the rollup as the gate", () => {
    matches(mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "IN_PROGRESS",
        conclusion: null,
      }), { kind: "code-review-gate" });
    matches(mapRollupNode({
        __typename: "StatusContext",
        context: "Code Review Gate",
        state: "PENDING",
      }), { kind: "code-review-gate" });
  });

  it("classifies a Code Review Gate waiting on an owner approval as the gate", () => {
    matches(mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "COMPLETED",
        conclusion: "ACTION_REQUIRED",
        description: "1 of 2 policies",
      }), {
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
  });

  it("classifies a fast-path Code Review Gate waiting on an owner approval as the gate", () => {
    matches(parseFastCheck({
        name: "Code Review Gate",
        state: "ACTION_REQUIRED",
        bucket: "fail",
      }), {
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
    matches(parseFastCheck({ name: "ci", state: "ACTION_REQUIRED", bucket: "fail" }), { kind: "failed", reportedState: "ACTION_REQUIRED" });
  });

  it("maps StatusContext states and drops unknown typenames", () => {
    matches(mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "EXPECTED",
      }), { kind: "pending", reportedState: "PENDING" });
    matches(mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "FUTURE_VALUE",
      }), { kind: "failed", reportedState: "FUTURE_VALUE" });
    assert.equal(mapRollupNode({ __typename: "FutureNode" }), null);
  });
});

describe("closed enum parsing", () => {
  const rawPullRequest = {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    headRefName: "feature",
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
  };

  it("accepts mergeStateStatus CONFLICTING", () => {
    assert.equal(parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "CONFLICTING" },
        context
      ).mergeStateStatus, "CONFLICTING");
  });

  it("reads gh's empty reviewDecision as no decision rather than a parse failure", () => {
    assert.equal(parsePullRequest({ ...rawPullRequest, reviewDecision: "" }, context)
        .reviewDecision, null);
  });

  it("still rejects an unknown reviewDecision", () => {
    assert.throws(() =>
      parsePullRequest({ ...rawPullRequest, reviewDecision: "MAYBE" }, context), WatcherQueryError);
  });

  it("rejects unknown enum values as retryable errors carrying the raw value", () => {
    try {
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "FUTURE_STATE" },
        context
      );
      throw new Error("expected parser to throw");
    } catch (error) {
      assert.ok(error instanceof WatcherQueryError);
      if (!(error instanceof WatcherQueryError)) throw error;
      matches(error.failure, {
        kind: "missing-key",
        retryable: true,
        rawValue: '"FUTURE_STATE"',
      });
    }
  });
});

it("parses a thread page and keeps only unresolved threads", () => {
  const comment = (login: string) => ({
    body: "please fix",
    createdAt: "now",
    path: "a.ts",
    line: 1,
    author: { login },
  });
  const response = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              { id: "one", isResolved: false, comments: { nodes: [comment("alice")] } },
              { id: "two", isResolved: false, comments: { nodes: [] } },
              { id: "resolved", isResolved: true, comments: { nodes: [comment("bob")] } },
            ],
          },
        },
      },
    },
  };
  const threads = buildReviewThreads(parseReviewThreadPage(response).threads);
  assert.deepEqual(threads, [
    {
      id: "one",
      firstComment: { authorLogin: "alice", body: "please fix", path: "a.ts", line: 1, createdAt: "now" },
    },
    { id: "two", firstComment: null },
  ]);
});

describe("review thread pagination", () => {
  const thread = (id: string, resolved = false) => ({
    id,
    firstComment: {
      authorLogin: "someone",
      body: "please fix",
      path: "a.ts",
      line: 1,
      createdAt: "now",
    },
    resolved,
  });

  it("keeps walking pages until the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two")], endCursor: "last" },
        { threads: [thread("three")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    assert.deepEqual(threads.map((item) => item.id), ["one", "two", "three"]);
    assert.deepEqual(reader.calls, [
      "reviewThreadPage:null",
      "reviewThreadPage:next",
      "reviewThreadPage:last",
    ]);
  });

  it("sees an unresolved thread that sits past the first page", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("early", true)], endCursor: "next" },
        { threads: [thread("late")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    assert.deepEqual(threads.map((item) => item.id), ["late"]);
  });

  it("stops after a single page when the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [{ threads: [thread("only")], endCursor: null }],
    });
    assert.equal((await resolveReviewThreads(reader, context)).length, 1);
    assert.deepEqual(reader.calls, ["reviewThreadPage:null"]);
  });

  it("drops resolved threads from later pages too", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two", true)], endCursor: null },
      ],
    });
    assert.deepEqual((await resolveReviewThreads(reader, context)).map((item) => item.id), ["one"]);
  });

  it("rejects a page that omits pageInfo instead of assuming one page", async () => {
    const response = {
      data: {
        repository: {
          pullRequest: { reviewThreads: { nodes: [] } },
        },
      },
    };
    assert.throws(() => parseReviewThreadPage(response), WatcherQueryError);
  });
});

describe("context and stack discovery", () => {
  it("returns a fully explicit context without any reader call", async () => {
    const reader = fakeReader();
    assert.deepEqual(await resolveContext({
        reader,
        owner: "explicit",
        repo: "repo",
        pr: context.number,
      }), { owner: "explicit", repo: "repo", number: context.number });
    assert.deepEqual(reader.calls, []);
  });

  it("uses the local origin before currentPr for an explicit number", async () => {
    const reader = fakeReader({ origin: { owner: "local", repo: "checkout" } });
    assert.deepEqual(await resolveContext({
        reader,
        owner: null,
        repo: null,
        pr: context.number,
      }), { owner: "local", repo: "checkout", number: context.number });
    assert.deepEqual(reader.calls, ["originRepo"]);
  });

  it("orders the connected stack bottom-to-top", () => {
    const ordered = orderStack(context, [
      {
        number: parsePrNumber(41),
        headRefName: "base-feature",
        isCrossRepository: false,
        baseRefName: "main",
      },
      {
        number: context.number,
        headRefName: "feature",
        isCrossRepository: false,
        baseRefName: "base-feature",
      },
      {
        number: parsePrNumber(43),
        headRefName: "upstack",
        isCrossRepository: false,
        baseRefName: "feature",
      },
    ]);
    assert.deepEqual(ordered.map((item) => Number(item.number)), [41, 42, 43]);
  });
  it("does not use a fork's same-named head as a stack parent", () => {
    const ordered = orderStack(context, [
      { number: parsePrNumber(41), headRefName: "base-feature", baseRefName: "main", isCrossRepository: true },
      { number: context.number, headRefName: "feature", baseRefName: "base-feature", isCrossRepository: false },
    ]);
    assert.deepEqual(ordered.map((item) => Number(item.number)), [42]);
  });

  it("does not attach upstream branch children to a fork head", () => {
    const ordered = orderStack(context, [
      { number: context.number, headRefName: "feature", baseRefName: "main", isCrossRepository: true },
      { number: parsePrNumber(43), headRefName: "upstack", baseRefName: "feature", isCrossRepository: false },
    ]);
    assert.deepEqual(ordered.map((item) => Number(item.number)), [42]);
  });

  it("terminates when an unrelated fork opens main against main", () => {
    // Bound the subprocess so this regression reports a failure instead of hanging the suite.
    const program = `import { orderStack } from ${JSON.stringify(join(import.meta.dirname, "../../scripts/watch-pr/github.ts"))};
      console.log(JSON.stringify(orderStack(${JSON.stringify(context)}, [
        { number: 41, headRefName: "main", baseRefName: "main", isCrossRepository: true },
        { number: 42, headRefName: "feature", baseRefName: "main", isCrossRepository: false }
      ])));`;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", program], { encoding: "utf8", timeout: 2000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0);
    assert.deepEqual(JSON.parse(child.stdout).map((item: { number: number }) => item.number), [42]);
  });

  it("requests and parses fork identity from gh before stack discovery", () => {
    const directory = mkdtempSync(join(tmpdir(), "watch-pr-fork-"));
    try {
      writeFileSync(join(directory, "gh"), `#!/bin/sh
case "$*" in
  *number,headRefName,baseRefName,isCrossRepository*) ;;
  *) exit 2 ;;
esac
printf '%s\\n' '[{"number":42,"headRefName":"feature","baseRefName":"main","isCrossRepository":true}]'
`, { mode: 0o755 });
      const program = `import { GhGitHubReader } from ${JSON.stringify(join(import.meta.dirname, "../../scripts/watch-pr/github.ts"))};
        console.log(JSON.stringify(await new GhGitHubReader().openPullRequests({ owner: "owner", repo: "repo" })));`;
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", program], {
        encoding: "utf8", timeout: 2000,
        env: { ...process.env, ASTACK_GH: join(directory, "gh") },
      });
      assert.equal(child.error, undefined);
      assert.equal(child.status, 0);
      assert.deepEqual(JSON.parse(child.stdout), [
        { number: 42, headRefName: "feature", baseRefName: "main", isCrossRepository: true },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

});
