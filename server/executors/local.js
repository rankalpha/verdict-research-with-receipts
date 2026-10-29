"use strict";
/**
 * Local subprocess executor (development fallback, used when Docker is absent).
 *
 * NOT a security boundary — it exists so the app can run on a dev machine.
 * It still enforces the two controls that matter most for the demo:
 *   - environment scrubbing: the generated code never sees LLM_API_KEY
 *   - hard wall-clock timeout
 * Production deployments must use the Docker backend (see DEPLOY.md).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const timeoutMs = () => Number(process.env.SANDBOX_TIMEOUT_MS || 45000);

// Minimal Windows/POSIX allowlist; everything else (incl. secrets) is dropped.
// HTTPS_PROXY is included so sandboxed fetch() can traverse a dev-machine
// firewall via the prelude (see sandbox-prelude.cjs) — it is a local address,
// not a credential. Secrets like LLM_API_KEY are never allowlisted.
const ENV_ALLOWLIST = [
  "PATH",
  "SystemRoot",
  "SYSTEMDRIVE",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
  "HOME",
  "LANG",
  "TZ",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
];

const PRELUDE = require.resolve("../sandbox-prelude.cjs");

/**
 * @param {{workdir: string, scriptFile: string}} task
 * @param {(e: {type: string, data?: any}) => void} onEvent
 */
function runScript(task, onEvent) {
  return new Promise((resolve) => {
    const env = {};
    for (const k of ENV_ALLOWLIST) if (process.env[k] !== undefined) env[k] = process.env[k];
    const proxy = env.HTTPS_PROXY || env.HTTP_PROXY;
    if (proxy) env.HTTPS_PROXY = proxy;
    onEvent({ type: "sandbox", data: `node ${path.basename(task.scriptFile)} (env scrubbed${proxy ? ", proxy-aware" : ""}, ${timeoutMs()}ms cap)` });
    const child = spawn(process.execPath, ["--require", PRELUDE, task.scriptFile], {
      cwd: task.workdir,
      env,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs());
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, timedOut: false, stdout, stderr: stderr + String(err) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, timedOut, stdout, stderr });
    });
  });
}

function listArtifacts(workdir) {
  return fs
    .readdirSync(workdir)
    .filter((f) => f !== "task.mjs" && f !== "receipt.json")
    .map((f) => {
      const st = fs.statSync(path.join(workdir, f));
      return { name: f, size: st.size };
    });
}

module.exports = { runScript, listArtifacts, available: () => true };
