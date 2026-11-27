import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type Rule = "cursor-residue" | "cast-in-public" | "merge-ban" | "frontmatter" | "size";
export interface LintIssue {
  file: string;
  line: number;
  rule: Rule;
  message: string;
}

const SCAN_ROOTS = ["skills", "agents", "hooks", ".claude-plugin", "README.md", "docs/guide"];
const CURSOR_CS = /\bCursor\b/;
const CURSOR_CI = /generalPurpose|bugbot|\.mdc|cursor-team-kit|control-ui|control-cli|gemini-|poteto|pstack-models/i;
const CAST = ["Jinhsi", "Phoebe", "Shorekeeper", "Encore", "Xiangli Yao", "Verina", "Zhezhi"];
const CAST_RE = new RegExp(`\\b(${CAST.join("|")})\\b`);
const MERGE_RE = /gh\s+pr\s+merge/;

function walk(path: string, out: string[]): void {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    out.push(path);
    return;
  }
  for (const e of readdirSync(path).sort()) walk(join(path, e), out);
}

function parseFrontmatter(text: string): Record<string, string> | null {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const out: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return out;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (m) out[m[1]] = m[2].trim();
  }
  return null;
}

export function lintTree(root: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const files: string[] = [];
  for (const r of SCAN_ROOTS) walk(join(root, r), files);

  for (const abs of files) {
    const rel = relative(root, abs).split("\\").join("/");
    const text = readFileSync(abs, "utf8");
    const lines = text.split("\n");
    const add = (line: number, rule: Rule, message: string) => issues.push({ file: rel, line, rule, message });

    lines.forEach((l, i) => {
      if (CURSOR_CS.test(l) || CURSOR_CI.test(l)) add(i + 1, "cursor-residue", `Cursor residue: ${l.trim()}`);
      if (/^(skills|agents)\//.test(rel) && MERGE_RE.test(l)) add(i + 1, "merge-ban", "gh pr merge is banned");
    });

    if (rel.startsWith(".claude-plugin/") && rel.endsWith(".json")) {
      lines.forEach((l, i) => {
        const m = CAST_RE.exec(l);
        if (m) add(i + 1, "cast-in-public", `Cast name "${m[1]}" in public manifest`);
      });
    }

    const isSkill = /^skills\/[^/]+\/SKILL\.md$/.test(rel);
    const isAgent = /^agents\/[^/]+\.md$/.test(rel);
    if (isSkill || isAgent) {
      const fm = parseFrontmatter(text);
      if (!fm) add(1, "frontmatter", "missing YAML frontmatter");
      else {
        if (!fm.name) add(1, "frontmatter", "missing name");
        if (!fm.description) add(1, "frontmatter", "missing description");
        if (isSkill && fm.name && fm.name !== basename(dirname(abs)))
          add(1, "frontmatter", `name "${fm.name}" does not match folder "${basename(dirname(abs))}"`);
      }
    }

    const count = text.endsWith("\n") ? lines.length - 1 : lines.length;
    if (rel === "skills/astack/SKILL.md" && count > 150) add(count, "size", `${count} lines exceeds 150`);
    if (/^skills\/astack\/playbooks\/[^/]+\.md$/.test(rel) && count > 60)
      add(count, "size", `${count} lines exceeds 60`);
  }
  return issues;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const issues = lintTree(root);
  for (const i of issues) console.log(`${i.file}:${i.line} ${i.rule} ${i.message}`);
  process.exit(issues.length ? 1 : 0);
}
