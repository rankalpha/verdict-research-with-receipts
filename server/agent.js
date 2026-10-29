"use strict";
/**
 * Verdict orchestrator: plan -> code -> run (sandboxed) -> verify -> answer.
 *
 * Every step produces a "receipt": the exact code that ran, its raw output,
 * exit status and artifacts. The final answer must cite receipts; nothing is
 * claimed that was not executed.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chat } = require("./llm");

const MAX_STEPS = Number(process.env.AGENT_MAX_STEPS || 4);
const MAX_RETRIES = Number(process.env.AGENT_MAX_RETRIES || 2);

function pickExecutor() {
  if (process.env.SANDBOX_BACKEND === "docker") {
    return require("./executors/docker");
  }
  if (process.env.SANDBOX_BACKEND === "local") {
    return require("./executors/local");
  }
  // Auto-detect
  try {
    require("child_process").execSync("docker info", { stdio: "ignore", timeout: 4000 });
    return require("./executors/docker");
  } catch {
    return require("./executors/local");
  }
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error("no JSON found in model output");
  const body = raw.slice(start);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "[" || c === "{") depth++;
    if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return JSON.parse(body.slice(0, i + 1));
    }
  }
  throw new Error("unbalanced JSON in model output");
}

const CODE_RULES = `You write Node.js 20 scripts (ESM, single file). Strict rules:
- The script runs UNATTENDED in a sandbox. It must print its findings to stdout as its final act.
- fetch() is available. fs is available and the process cwd is a writable work directory.
- NO other npm packages. No user input. No interactive APIs.
- Print a compact, machine-readable summary: lines like "RESULT: <key>=<value>" plus a short "SUMMARY:" line.
- Keep runtime under 30 seconds. Guard fetches with try/catch and timeouts (AbortController).
- If a data source fails, try a fallback, otherwise say plainly what failed in the SUMMARY line.`;

/**
 * @param {string} question
 * @param {(e: {type: string, data?: any}) => void} emit
 */
async function runTask(question, emit) {
  const executor = pickExecutor();
  const startedAt = Date.now();
  const receipts = [];

  emit({ type: "status", data: "Planning…" });
  const planRaw = await chat(
    [
      {
        role: "system",
        content:
          "You are Verdict, a research agent. Decompose the user's question into at most " +
          MAX_STEPS +
          " concrete, independently executable steps. Each step must be answerable by running a small Node.js script (fetch a public API/page and compute something, read data, do arithmetic on real numbers). Prefer official or primary data sources. Reply ONLY with JSON: [{\"intent\": \"one line describing what this step establishes\", \"hint\": \"concrete source/approach, e.g. a URL or method\"}]",
      },
      { role: "user", content: question },
    ],
    { temperature: 0.1, maxTokens: 800 }
  );
  const plan = extractJson(planRaw).slice(0, MAX_STEPS);
  emit({ type: "plan", data: plan });

  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    emit({ type: "step_start", data: { index: i, intent: step.intent } });

    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "verdict-"));
    const scriptFile = path.join(workdir, "task.mjs");
    let result = null;
    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      emit({
        type: "status",
        data: `Step ${i + 1}: writing code (attempt ${attempt + 1})…`,
      });
      const code = await chat(
        [
          { role: "system", content: CODE_RULES },
          {
            role: "user",
            content: `Overall question: ${question}\nStep to implement: ${step.intent}\nApproach hint: ${step.hint}\n` +
              (lastError ? `\nThe previous version of this script failed:\n${lastError}\nWrite a fixed version.` : ""),
          },
        ],
        { temperature: 0.2, maxTokens: 1800 }
      );
      const codeBody = (code.match(/```(?:js|javascript)?\s*([\s\S]*?)```/) || [, code])[1].trim();
      emit({ type: "code", data: { index: i, code: codeBody } });
      fs.writeFileSync(scriptFile, codeBody);

      emit({ type: "status", data: `Step ${i + 1}: executing in sandbox…` });
      result = await executor.runScript({ workdir, scriptFile }, emit);
      if (result.timedOut) {
        emit({ type: "contained", data: { index: i, reason: "wall-clock timeout hit — execution terminated by sandbox" } });
      }
      const ok = !result.timedOut && result.exitCode === 0 && /SUMMARY:/.test(result.stdout);
      emit({
        type: "output",
        data: { index: i, stdout: result.stdout.slice(0, 4000), stderr: result.stderr.slice(0, 2000), exitCode: result.exitCode, timedOut: result.timedOut },
      });
      if (ok) {
        receipts.push({
          step: i + 1,
          intent: step.intent,
          code: codeBody,
          stdout: result.stdout.slice(0, 8000),
          stderr: result.stderr.slice(0, 1000),
          exitCode: result.exitCode,
          timedOut: false,
          artifacts: executor.listArtifacts(workdir),
          durationMs: 0,
        });
        break;
      }
      lastError = `exit=${result.exitCode} timedOut=${result.timedOut}\nstdout:\n${result.stdout.slice(-1500)}\nstderr:\n${result.stderr.slice(-1500)}`;
      result = null;
      if (attempt === MAX_RETRIES) {
        emit({ type: "step_end", data: { index: i, ok: false } });
      }
    }
    if (result) emit({ type: "step_end", data: { index: i, ok: true } });
    fs.rmSync(workdir, { recursive: true, force: true });
  }

  emit({ type: "status", data: "Synthesizing answer from receipts…" });
  const answer = await chat(
    [
      {
        role: "system",
        content:
          "You are Verdict. Answer the user's question using ONLY the executed receipts provided. Cite receipts inline like [R1], [R2]. If receipts are missing or conflicting, say so plainly — never guess. Keep the answer under 250 words.",
      },
      {
        role: "user",
        content:
          `Question: ${question}\n\nReceipts (executed code + raw outputs):\n` +
          receipts
            .map((r) => `[R${r.step}] intent: ${r.intent}\ncode:\n${r.code}\noutput:\n${r.stdout}`)
            .join("\n\n"),
      },
    ],
    { temperature: 0.2, maxTokens: 900 }
  );

  const report = {
    question,
    answer,
    receipts,
    contained: [],
    totalMs: Date.now() - startedAt,
    model: require("./llm").LLM_MODEL,
    backend: process.env.SANDBOX_BACKEND || "auto",
  };
  emit({ type: "done", data: report });
  return report;
}

module.exports = { runTask };
