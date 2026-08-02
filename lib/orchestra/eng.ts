// Product & Eng team cores (final plan Phase 4). Runs LOCALLY (CLI) because
// specs need to read the repo and reviews need the git diff — neither exists
// in the hosted runtime. Board, ledger, and verdicts live in Convex like every
// other employee's.
//
// Division of labor:
//   Forge  (npm run eng)        — read-only repo tools → spec on the board
//   Mason  (a Claude Code session) — implements against the spec
//   Probe  (npm run eng:review) — layer 0 (typecheck/tests, deterministic)
//                                 then adversarial diff-vs-spec review
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { getClient } from "@/lib/claude/client";
import { api, convex } from "@/lib/convex/server";
import { buildSystem, FORGE_CHARTER, PROBE_CHARTER } from "@/lib/orchestra/charters";
import { guardBudget, recordSpend, type Usage } from "@/lib/orchestra/ledger";
import { resolveTier } from "@/lib/orchestra/tiers";
import {
  extractEnvelope,
  ForgeSpec,
  ProbeReview,
  todayDate,
} from "@/lib/orchestra/types";

const ROOT = process.cwd();
const MAX_TOOL_TURNS = 15;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".convex",
  "Dayspring.app",
]);

// ---- Read-only repo tools (path-traversal guarded) -------------------------

function safePath(p: string): string {
  const abs = resolve(ROOT, p);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) {
    throw new Error(`Path escapes the repo: ${p}`);
  }
  return abs;
}

function toolListDir(path: string): string {
  const abs = safePath(path || ".");
  return readdirSync(abs)
    .filter((n) => !SKIP_DIRS.has(n))
    .map((n) => {
      try {
        return statSync(join(abs, n)).isDirectory() ? `${n}/` : n;
      } catch {
        return n;
      }
    })
    .join("\n");
}

function toolReadFile(path: string, offset = 0, limit = 250): string {
  const text = readFileSync(safePath(path), "utf8");
  const lines = text.split("\n");
  const slice = lines.slice(offset, offset + Math.min(limit, 400));
  return (
    slice.map((l, i) => `${offset + i + 1}\t${l}`).join("\n") +
    (offset + slice.length < lines.length
      ? `\n… (${lines.length - offset - slice.length} more lines)`
      : "")
  );
}

function toolSearch(pattern: string, dir = "."): string {
  const results: string[] = [];
  const rx = new RegExp(pattern);
  const walk = (d: string, depth: number) => {
    if (depth > 6 || results.length >= 60) return;
    for (const name of readdirSync(d)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(full, depth + 1);
      else if (st.size < 300_000 && /\.(ts|tsx|js|mjs|json|md|css)$/.test(name)) {
        const rel = full.slice(ROOT.length + 1);
        const lines = readFileSync(full, "utf8").split("\n");
        for (let i = 0; i < lines.length && results.length < 60; i++) {
          if (rx.test(lines[i])) results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        }
      }
    }
  };
  walk(safePath(dir), 0);
  return results.length ? results.join("\n") : "(no matches)";
}

const FORGE_TOOLS = [
  {
    name: "list_dir",
    description: "List a repo directory (dirs end with /).",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description: "Read a repo file with line numbers. offset/limit for big files.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "number" },
        limit: { type: "number" },
      },
      required: ["path"],
    },
  },
  {
    name: "search",
    description: "Regex search across repo source files. Returns file:line: text.",
    input_schema: {
      type: "object",
      properties: { pattern: { type: "string" }, dir: { type: "string" } },
      required: ["pattern"],
    },
  },
];

function runTool(name: string, input: Record<string, unknown>): string {
  try {
    if (name === "list_dir") return toolListDir(String(input.path ?? "."));
    if (name === "read_file")
      return toolReadFile(
        String(input.path),
        Number(input.offset ?? 0),
        Number(input.limit ?? 250),
      );
    if (name === "search")
      return toolSearch(String(input.pattern), String(input.dir ?? "."));
    return `Unknown tool ${name}`;
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Client-side tool loop: metered per API call, capped turns.
async function toolLoop(args: {
  runDate: string;
  role: string;
  taskId: string;
  model: string;
  system: ReturnType<typeof buildSystem>;
  user: string;
  maxTokens: number;
}): Promise<{ text: string; usage: Usage }> {
  const client = await getClient();
  type Msg = { role: "user" | "assistant"; content: unknown };
  const messages: Msg[] = [{ role: "user", content: args.user }];
  let lastUsage: Usage = {};
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    await guardBudget(args.runDate);
    const resp = await client.messages.create({
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.system as never,
      tools: FORGE_TOOLS as never,
      messages: messages as never,
    });
    lastUsage = resp.usage as unknown as Usage;
    await recordSpend({
      runDate: args.runDate,
      role: args.role,
      taskId: args.taskId,
      model: args.model,
      usage: lastUsage,
    });
    const blocks = resp.content as unknown as {
      type: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      text?: string;
    }[];
    if (resp.stop_reason !== "tool_use") {
      const text = blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      return { text, usage: lastUsage };
    }
    messages.push({ role: "assistant", content: blocks });
    messages.push({
      role: "user",
      content: blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          type: "tool_result",
          tool_use_id: b.id,
          content: runTool(b.name ?? "", b.input ?? {}).slice(0, 20_000),
        })),
    });
  }
  throw new Error(`forge: tool budget exhausted (${MAX_TOOL_TURNS} turns).`);
}

// ---- Forge: oldest queued eng request → spec on the board -------------------

export async function runForgeSpec(): Promise<{ done: boolean; message: string }> {
  const runDate = todayDate();
  const tasks = await convex().query(api.orchestra.recentTasks, { limit: 100 });
  const request = tasks
    .filter((t) => t.role === "forge" && t.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!request) return { done: false, message: "No queued eng requests. File one on /company." };

  const tier = await resolveTier();
  await convex().mutation(api.orchestra.setTaskStatus, {
    taskId: request._id as never,
    status: "in_progress",
    bumpAttempts: true,
  });
  const { text, usage } = await toolLoop({
    runDate,
    role: "forge",
    taskId: String(request._id),
    model: tier.models.lead,
    system: buildSystem(FORGE_CHARTER),
    user:
      `### Feature request (from the CEO)\n${request.objective}\n\n` +
      `Explore the repo with your tools, then write the spec.`,
    maxTokens: 4000,
  });
  const parsed = extractEnvelope<ForgeSpec>(text, ForgeSpec);
  if (!parsed.ok) {
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: request._id as never,
      status: "failed",
      statusReason: `Spec envelope invalid: ${parsed.error.slice(0, 300)}`,
    });
    return { done: false, message: `Spec failed validation: ${parsed.error}` };
  }
  await convex().mutation(api.orchestra.attachArtifact, {
    taskId: request._id as never,
    runDate,
    role: "forge",
    kind: "spec",
    honestStatus: parsed.data.status,
    summary: parsed.data.summary,
    body:
      `# ${parsed.data.title}\n\nApproach: ${parsed.data.approach}\n\n` +
      `## Acceptance criteria\n${parsed.data.acceptanceCriteria.map((c) => `- [ ] ${c}`).join("\n")}\n\n` +
      `## Files likely touched\n${parsed.data.filesLikelyTouched.map((f) => `- ${f}`).join("\n")}\n\n` +
      `## Risks\n${parsed.data.risks.map((r) => `- ${r}`).join("\n")}\n\n---\n${parsed.body}`,
    citations: [],
    missing: parsed.data.missing,
    uncertainties: parsed.data.uncertainties,
    model: tier.models.lead,
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
    costUsd: 0,
  });
  return {
    done: true,
    message:
      `Spec "${parsed.data.title}" is on the board (task ${String(request._id).slice(-6)}).\n` +
      `Next: implement it (Claude Code session = Mason), then \`npm run eng:review\`.`,
  };
}

// ---- Probe: layer 0 + adversarial diff-vs-spec review -----------------------

function layer0(): { ok: boolean; output: string } {
  const results: string[] = [];
  let ok = true;
  for (const [label, cmd] of [
    ["typecheck", "npx tsc --noEmit"],
  ] as const) {
    try {
      execSync(cmd, { cwd: ROOT, stdio: "pipe", timeout: 240_000 });
      results.push(`${label}: PASS`);
    } catch (err) {
      ok = false;
      const out =
        err && typeof err === "object" && "stdout" in err
          ? String((err as { stdout: unknown }).stdout).slice(0, 4000)
          : String(err);
      results.push(`${label}: FAIL\n${out}`);
    }
  }
  return { ok, output: results.join("\n") };
}

export async function runProbeReview(): Promise<{ done: boolean; message: string }> {
  const runDate = todayDate();
  const tasks = await convex().query(api.orchestra.recentTasks, { limit: 100 });
  // Review the newest forge task that has a delivered spec.
  const specTask = tasks
    .filter((t) => t.role === "forge" && t.status === "delivered" && t.artifactId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!specTask?.artifactId) {
    return { done: false, message: "No delivered spec to review against. Run `npm run eng` first." };
  }
  const spec = await convex().query(api.orchestra.getArtifact, {
    artifactId: specTask.artifactId,
  });
  if (!spec) return { done: false, message: "Spec artifact unreadable." };

  const diff = execSync("git diff HEAD --stat && git diff HEAD", {
    cwd: ROOT,
    maxBuffer: 8_000_000,
  })
    .toString()
    .slice(0, 120_000);
  if (!diff.trim()) {
    return { done: false, message: "Working tree is clean — nothing to review." };
  }

  const gate = layer0();
  const tier = await resolveTier();
  const probeTaskId: string = await convex().mutation(api.orchestra.createTask, {
    runDate,
    role: "probe",
    objective: `Review the working-tree diff against spec: ${spec.summary.slice(0, 100)}`,
    definitionOfDone: ["Every acceptance criterion assessed against the diff"],
    boundaries: ["Review only — no edits, no merge decisions"],
    budgets: { maxOutputTokens: 3000, maxToolCalls: 0, maxUsd: 1.5 },
  });
  await convex().mutation(api.orchestra.setTaskStatus, {
    taskId: probeTaskId as never,
    status: "in_progress",
    bumpAttempts: true,
  });
  await guardBudget(runDate);
  const client = await getClient();
  const resp = await client.messages.create({
    model: tier.models.lead,
    max_tokens: 3000,
    system: buildSystem(PROBE_CHARTER) as never,
    messages: [
      {
        role: "user",
        content:
          `### Layer 0 (deterministic gates)\n${gate.output}\n\n### The spec\n${spec.body.slice(0, 12_000)}\n\n### The diff (working tree vs HEAD)\n${diff}`,
      },
    ],
  });
  const usage = resp.usage as unknown as Usage;
  await recordSpend({
    runDate,
    role: "probe",
    taskId: probeTaskId,
    model: tier.models.lead,
    usage,
  });
  const text = (resp.content as unknown as { type: string; text?: string }[])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const parsed = extractEnvelope<ProbeReview>(text, ProbeReview);
  if (!parsed.ok) {
    await convex().mutation(api.orchestra.setTaskStatus, {
      taskId: probeTaskId as never,
      status: "failed",
      statusReason: `Review envelope invalid: ${parsed.error.slice(0, 300)}`,
    });
    return { done: false, message: `Probe envelope invalid: ${parsed.error}` };
  }
  // Layer 0 failure overrides any model generosity.
  const verdict = gate.ok ? parsed.data.verdict : "refuted";
  await convex().mutation(api.orchestra.attachArtifact, {
    taskId: probeTaskId as never,
    runDate,
    role: "probe",
    kind: "verdict",
    honestStatus: parsed.data.status,
    summary: parsed.data.summary,
    body:
      `Verdict: ${verdict}${gate.ok ? "" : " (layer 0 FAILED — automatic)"}\n\n` +
      parsed.data.criteria
        .map((c) => `- [${c.met ? "x" : " "}] ${c.criterion} — ${c.note}`)
        .join("\n") +
      (parsed.data.issues.length
        ? `\n\nIssues:\n${parsed.data.issues.map((i) => `- ${i}`).join("\n")}`
        : ""),
    citations: [],
    missing: parsed.data.missing,
    uncertainties: parsed.data.uncertainties,
    model: tier.models.lead,
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
    costUsd: 0,
  });
  // Probe's verdict closes the forge task (delivered → verified/escalated).
  await convex().mutation(api.orchestra.recordVerdict, {
    taskId: specTask._id as never,
    verdict,
    verificationNotes: parsed.data.summary,
    onFail: "escalated",
  });
  return {
    done: true,
    message:
      `Probe verdict: ${verdict.toUpperCase()}\n${parsed.data.summary}\n` +
      (verdict === "confirmed"
        ? "Mergeable — the commit is yours to make."
        : `Fix list:\n${parsed.data.issues.map((i) => `- ${i}`).join("\n")}`),
  };
}
