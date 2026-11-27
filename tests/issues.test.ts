import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGhListArgs, claim, parseGhIssues, prStatus, release, summarizeChecks } from "../scripts/issues.ts";

const SCRIPT = fileURLToPath(new URL("../scripts/issues.ts", import.meta.url));
const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tmp(): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "astack-issues-")));
  dirs.push(d);
  return d;
}

// A fake gh: each case maps an exact argv string to canned stdout, or to an error.
// Every call is appended to calls.log. Unknown argv exits 0 with no output.
function fakeGh(cases: Record<string, string | { fail: string }>): { bin: string; calls: () => string[] } {
  const d = tmp();
  const log = join(d, "calls.log");
  const arms = Object.entries(cases)
    .map(([argv, out]) =>
      typeof out === "string"
        ? `  '${argv}') printf '%s\\n' '${out}' ;;`
        : `  '${argv}') printf '%s\\n' '${out.fail}' >&2; exit 1 ;;`,
    )
    .join("\n");
  const bin = join(d, "gh");
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\ncase "$*" in\n${arms}\nesac\n`);
  chmodSync(bin, 0o755);
  return { bin, calls: () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []) };
}

function withGh<T>(bin: string, fn: () => T): T {
  const prev = process.env.ASTACK_GH;
  process.env.ASTACK_GH = bin;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.ASTACK_GH;
    else process.env.ASTACK_GH = prev;
  }
}

const VIEW = "issue view 7 --json state,assignees,labels";
const EDIT = "issue edit 7 --add-assignee @me --add-label astack:in-progress";

test("buildGhListArgs: two labels and an assignee", () => {
  assert.deepEqual(buildGhListArgs({ source: "github", labels: ["bug", "ready"], assignee: "octocat" }), [
    "issue", "list", "--state", "open",
    "--json", "number,title,body,url,labels,assignees",
    "--label", "bug", "--label", "ready",
    "--assignee", "octocat",
    "--limit", "50",
  ]);
});

test("buildGhListArgs: milestone, no labels", () => {
  assert.deepEqual(buildGhListArgs({ source: "github", milestone: "v2" }), [
    "issue", "list", "--state", "open",
    "--json", "number,title,body,url,labels,assignees",
    "--milestone", "v2",
    "--limit", "50",
  ]);
});

test("parseGhIssues maps gh JSON to Issue", () => {
  const json = JSON.stringify([
    {
      number: 12,
      title: "Add dark mode toggle to /settings",
      body: "Users want a theme switch.",
      url: "https://github.com/acme/web/issues/12",
      labels: [{ name: "feature" }, { name: "ui" }],
      assignees: [],
    },
    { number: 3, title: "Empty body", body: null, url: "https://github.com/acme/web/issues/3", labels: [], assignees: [] },
  ]);
  assert.deepEqual(parseGhIssues(json), [
    {
      source: "github",
      id: "12",
      number: 12,
      title: "Add dark mode toggle to /settings",
      body: "Users want a theme switch.",
      url: "https://github.com/acme/web/issues/12",
      labels: ["feature", "ui"],
    },
    { source: "github", id: "3", number: 3, title: "Empty body", body: "", url: "https://github.com/acme/web/issues/3", labels: [] },
  ]);
});

test("parseGhIssues rejects non-array JSON", () => {
  assert.throws(() => parseGhIssues('{"number":1}'), /array/);
});

test("claim skips a closed issue without editing it", () => {
  const gh = fakeGh({ [VIEW]: '{"state":"CLOSED","assignees":[],"labels":[]}', "api user --jq .login": "me" });
  assert.deepEqual(withGh(gh.bin, () => claim(7, tmp())), { result: "skipped", reason: "closed" });
  assert.ok(!gh.calls().some((c) => c.startsWith("issue edit")));
});

test("claim skips an issue assigned to another user", () => {
  const gh = fakeGh({
    [VIEW]: '{"state":"OPEN","assignees":[{"login":"someone-else"}],"labels":[]}',
    "api user --jq .login": "me",
  });
  assert.deepEqual(withGh(gh.bin, () => claim(7, tmp())), { result: "skipped", reason: "assigned to someone-else" });
  assert.ok(!gh.calls().some((c) => c.startsWith("issue edit")));
});

test("claim assigns and labels an open issue", () => {
  const gh = fakeGh({ [VIEW]: '{"state":"OPEN","assignees":[{"login":"me"}],"labels":[]}', "api user --jq .login": "me" });
  assert.deepEqual(withGh(gh.bin, () => claim(7, tmp())), { result: "claimed" });
  assert.ok(gh.calls().includes(EDIT));
});

test("claim creates the in-progress label once when it is missing", () => {
  const d = tmp();
  const flag = join(d, "label-made");
  const bin = join(d, "gh");
  writeFileSync(
    bin,
    `#!/bin/sh
printf '%s\\n' "$*" >> '${d}/calls.log'
case "$*" in
  '${VIEW}') echo '{"state":"OPEN","assignees":[],"labels":[]}' ;;
  'api user --jq .login') echo me ;;
  'label create'*) touch '${flag}' ;;
  '${EDIT}') [ -f '${flag}' ] || { echo "could not add label: 'astack:in-progress' not found" >&2; exit 1; } ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  assert.deepEqual(withGh(bin, () => claim(7, d)), { result: "claimed" });
  const calls = readFileSync(join(d, "calls.log"), "utf8").trim().split("\n");
  assert.equal(calls.filter((c) => c.startsWith("label create astack:in-progress")).length, 1);
  assert.equal(calls.filter((c) => c === EDIT).length, 2);
});

test("claim skips an issue AStack already holds, even when assigned to me", () => {
  const gh = fakeGh({
    [VIEW]: '{"state":"OPEN","assignees":[{"login":"me"}],"labels":[{"name":"astack:in-progress"}]}',
    "api user --jq .login": "me",
  });
  assert.deepEqual(withGh(gh.bin, () => claim(7, tmp())), { result: "skipped", reason: "in progress" });
  assert.ok(!gh.calls().some((c) => c.startsWith("issue edit")));
});

test("claim skips an issue waiting on an answer", () => {
  const gh = fakeGh({ [VIEW]: '{"state":"OPEN","assignees":[],"labels":[{"name":"astack:needs-info"}]}' });
  assert.deepEqual(withGh(gh.bin, () => claim(7, tmp())), { result: "skipped", reason: "needs info" });
});

test("release --needs-info swaps in the needs-info label, creating it when missing", () => {
  const d = tmp();
  const flag = join(d, "label-made");
  const edit = "issue edit 7 --remove-label astack:in-progress --remove-assignee @me --add-label astack:needs-info";
  const bin = join(d, "gh");
  writeFileSync(
    bin,
    `#!/bin/sh
printf '%s\n' "$*" >> '${d}/calls.log'
case "$*" in
  'label create'*) touch '${flag}' ;;
  '${edit}') [ -f '${flag}' ] || { echo "could not add label: 'astack:needs-info' not found" >&2; exit 1; } ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  withGh(bin, () => release(7, d, { needsInfo: true }));
  const calls = readFileSync(join(d, "calls.log"), "utf8").trim().split("\n");
  assert.equal(calls.filter((c) => c.startsWith("label create astack:needs-info")).length, 1);
  assert.equal(calls.filter((c) => c === edit).length, 2);
});

test("summarizeChecks reduces a rollup to one CI state", () => {
  assert.equal(summarizeChecks([]), "none");
  assert.equal(summarizeChecks([{ status: "COMPLETED", conclusion: "SUCCESS" }, { state: "SUCCESS" }]), "green");
  assert.equal(summarizeChecks([{ status: "IN_PROGRESS" }, { status: "COMPLETED", conclusion: "SUCCESS" }]), "pending");
  assert.equal(summarizeChecks([{ status: "IN_PROGRESS" }, { status: "COMPLETED", conclusion: "FAILURE" }]), "red");
  assert.equal(summarizeChecks([{ state: "PENDING" }]), "pending");
});

const PR_LIST = "pr list --head astack/12-dark-mode --state all --json number,url,isDraft,state,statusCheckRollup";

test("prStatus reads the branch's PR and its CI", () => {
  const gh = fakeGh({
    [PR_LIST]:
      '[{"number":48,"url":"https://github.com/acme/web/pull/48","isDraft":true,"state":"OPEN","statusCheckRollup":[{"status":"COMPLETED","conclusion":"FAILURE"}]}]',
  });
  assert.deepEqual(withGh(gh.bin, () => prStatus("astack/12-dark-mode", tmp())), {
    number: 48,
    url: "https://github.com/acme/web/pull/48",
    draft: true,
    state: "OPEN",
    ci: "red",
  });
});

test("prStatus is null before the owner opens a PR", () => {
  const gh = fakeGh({ [PR_LIST]: "[]" });
  assert.equal(withGh(gh.bin, () => prStatus("astack/12-dark-mode", tmp())), null);
});

test("release removes the label and the assignee", () => {
  const gh = fakeGh({});
  withGh(gh.bin, () => release(7, tmp()));
  assert.deepEqual(gh.calls(), ["issue edit 7 --remove-label astack:in-progress --remove-assignee @me"]);
});

function githubRepo(): string {
  const d = tmp();
  execFileSync("git", ["init", "-q"], { cwd: d });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:acme/web.git"], { cwd: d });
  return d;
}

function cli(args: string[], cwd: string, gh: string) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ASTACK_GH: gh, HOME: tmp() },
  });
}

test("list exits 2 when gh is missing", () => {
  const r = cli(["list"], githubRepo(), join(tmp(), "no-such-gh"));
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /GitHub unavailable: gh not found/);
});

test("list exits 2 when gh is not logged in", () => {
  const args = buildGhListArgs({ source: "github" }).join(" ");
  const gh = fakeGh({ [args]: { fail: "To get started with GitHub CLI, please run:  gh auth login" } });
  const r = cli(["list"], githubRepo(), gh.bin);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /not authenticated/);
});

test("list prints one JSON line and drops issues in progress or waiting on an answer", () => {
  const args = buildGhListArgs({ source: "github" }).join(" ");
  const out = JSON.stringify([
    { number: 1, title: "Free", body: "b", url: "u1", labels: [], assignees: [] },
    { number: 2, title: "Taken", body: "b", url: "u2", labels: [{ name: "astack:in-progress" }], assignees: [] },
    { number: 3, title: "Asked", body: "b", url: "u3", labels: [{ name: "astack:needs-info" }], assignees: [] },
  ]);
  const gh = fakeGh({ [args]: out });
  const r = cli(["list"], githubRepo(), gh.bin);
  assert.equal(r.status, 0, r.stderr);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines.length, 1);
  assert.deepEqual(
    JSON.parse(lines[0]).map((i: { number: number }) => i.number),
    [1],
  );
});

test("claim CLI prints one JSON line", () => {
  const gh = fakeGh({ [VIEW]: '{"state":"CLOSED","assignees":[],"labels":[]}', "api user --jq .login": "me" });
  const r = cli(["claim", "7"], githubRepo(), gh.bin);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { issue: 7, result: "skipped", reason: "closed" });
});

test("comment passes the text as the body", () => {
  const gh = fakeGh({});
  const r = cli(["comment", "7", "Which page should the toggle live on?"], githubRepo(), gh.bin);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(gh.calls(), ["issue comment 7 --body Which page should the toggle live on?"]);
});
