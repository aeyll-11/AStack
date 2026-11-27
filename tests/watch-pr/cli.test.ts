import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type CliOptions, type CliRuntime, main, parseArgs } from "../../scripts/watch-pr/cli.ts";
import { fakeReader, passingCheck, matches } from "./fakes.test-helper.ts";
import { renderJson, renderPretty } from "../../scripts/watch-pr/render.ts";
import type { GitHubReader, WatcherVerdict } from "../../scripts/watch-pr/types.ts";
import { parsePrNumber } from "../../scripts/watch-pr/types.ts";

function options(argv: readonly string[]): CliOptions {
  const parsed = parseArgs(argv);
  if (parsed === "help") throw new Error("unexpected help");
  return parsed;
}

function testRuntime(reader: GitHubReader): {
  readonly runtime: CliRuntime;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    runtime: {
      reader,
      clock: {
        now: () => 0,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("test unexpectedly slept");
        },
      },
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  };
}

describe("parseArgs", () => {
  it("uses the specified defaults", () => {
    matches(options([]), {
      owner: null,
      repo: null,
      pr: null,
      mode: "single",
      stackPrs: [],
      statusOnly: false,
      summary: false,
      pretty: false,
      polling: {
        interval: 60,
        sweepInterval: 300,
        timeout: 0,
        maxQueryErrors: 5,
        allowDraft: false,
      },
    });
  });

  it("parses a frozen queued stack bottom-to-top", () => {
    const parsed = options(
      [
        "--queued-stack",
        "--stack-prs",
        "#10, 11,#12",
        "--interval",
        "2.5",
        "--sweep-interval",
        "30",
        "--timeout",
        "0",
        "--max-query-errors",
        "3",
        "--allow-draft",
        "--pretty",
      ]
    );
    assert.equal(parsed.mode, "queued-stack");
    assert.deepEqual(parsed.stackPrs.map(Number), [10, 11, 12]);
    assert.deepEqual(parsed.polling, {
      interval: 2.5,
      sweepInterval: 30,
      timeout: 0,
      maxQueryErrors: 3,
      allowDraft: true,
    });
    assert.equal(parsed.pretty, true);
  });

  it("takes the PR as a positional argument, and --json implies one read", () => {
    const parsed = options(["#42", "--once", "--json"]);
    assert.equal(parsed.pr, 42);
    assert.equal(parsed.statusOnly, true);
    assert.equal(parsed.summary, true);
    assert.equal(options(["--once"]).statusOnly, true);
  });

  it("rejects every invalid mode and numeric shape as usage", async () => {
    const invalid = [
      ["--unknown"],
      ["--interval", "0"],
      ["--sweep-interval", "-1"],
      ["--timeout", "-1"],
      ["--max-query-errors", "1.5"],
      ["--stack", "--queued-stack"],
      ["--stack-prs", "1,2"],
      ["--queued-stack", "--stack-prs", "1,1"],
      ["1", "--pr", "2"],
      ["1", "2"],
      ["abc"],
      ["--stack", "--json"],
    ];
    for (const argv of invalid) {
      const harness = testRuntime(fakeReader());
      assert.equal(await main(argv, harness.runtime), 64);
      assert.deepEqual(harness.stdout, []);
      assert.ok(harness.stderr.join("").includes("error:"));
    }
  });
});

describe("rendering", () => {
  const context = {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const status = {
    schemaVersion: 1,
    sequence: 1,
    observedAt: "2026-07-26T00:00:00.000Z",
    mode: "single",
    kind: "STATUS",
    terminal: true,
    exitCode: 0,
    reason: "status-only",
    rows: [
      {
        kind: "merged",
        context,
        facts: {
          context,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          reviewDecision: "APPROVED",
          headRefOid: "head",
          headRefName: "feature",
          baseRefName: "main",
          state: "MERGED",
          mergedAt: "now",
          isDraft: false,
        },
      },
    ],
  } satisfies WatcherVerdict;

  it("emits compact valid JSON by default", () => {
    const rendered = renderJson(status);
    assert.equal(rendered.endsWith("\n"), true);
    assert.deepEqual(JSON.parse(rendered), status);
  });

  it("renders the Markdown table from the same verdict only", () => {
    const rendered = renderPretty(status);
    assert.ok(rendered.includes("| PR | CI | Review | Merge |"));
    assert.ok(rendered.includes(
      "| [#1](https://github.com/owner/repo/pull/1) | \u2014 | \u2014 | ✅ merged |"
    ));
  });
});

describe("main", () => {
  it("returns EX_USAGE 64 and writes usage errors only to stderr", async () => {
    const harness = testRuntime(fakeReader());
    assert.equal(await main(["--interval", "0"], harness.runtime), 64);
    assert.deepEqual(harness.stdout, []);
    assert.ok(harness.stderr.join("").includes(
      "option '--interval <seconds>' argument '0' is invalid"
    ));
  });

  it("bypasses the queue machine for queued-stack status-only", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    const code = await main(
      [
        "--owner",
        "owner",
        "--repo",
        "repo",
        "--queued-stack",
        "--stack-prs",
        "1",
        "--status-only",
      ],
      harness.runtime
    );
    assert.equal(code, 0);
    assert.equal(harness.stdout.length, 1);
    const verdict: unknown = JSON.parse(harness.stdout[0]);
    matches(verdict, {
      kind: "STATUS",
      terminal: true,
      exitCode: 0,
      mode: "queued-stack",
    });
    assert.ok(!harness.stdout[0].includes('"kind":"QUEUE"'));
  });

  it("returns exit 4 for a hidden GitHub-side CI refusal", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const harness = testRuntime(reader);
    const code = await main(
      ["--owner", "owner", "--repo", "repo", "--pr", "1"],
      harness.runtime
    );
    assert.equal(code, 4);
    assert.equal(harness.stdout.length, 1);
    matches(JSON.parse(harness.stdout[0]), {
      kind: "BLOCKER",
      exitCode: 4,
      blocker: {
        kind: "failing-checks",
        ci: { kind: "ci-github-rejected" },
      },
    });
  });

  it("shows help without touching the reader", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    assert.equal(await main(["--help"], harness.runtime), 0);
    assert.ok(harness.stdout.join("").includes("JSON (NDJSON while polling)"));
    assert.deepEqual(reader.calls, []);
  });
});
