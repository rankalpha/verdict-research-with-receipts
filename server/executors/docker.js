"use strict";
/**
 * Docker sandbox executor (production backend, used on the Vultr VM).
 *
 * Every generated script runs in an ephemeral container:
 *   - resource capped (memory / cpu / pids)
 *   - read-only root filesystem, writable tmp dir only
 *   - no privileges, all Linux capabilities dropped
 *   - env scrubbed: the container never sees LLM_API_KEY or any host secret
 *   - hard wall-clock timeout; the container is force-killed and removed
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const MEMORY = process.env.SANDBOX_MEMORY || "256m";
const CPUS = process.env.SANDBOX_CPUS || "0.5";
const PIDS = process.env.SANDBOX_PIDS || "64";
const timeoutMs = () => Number(process.env.SANDBOX_TIMEOUT_MS || 45000);
const IMAGE = process.env.SANDBOX_IMAGE || "node:20-alpine";

/**
 * @param {{workdir: string, scriptFile: string}} task
 * @param {(e: {type: string, data?: any}) => void} onEvent
 * @returns {Promise<{exitCode: number|null, timedOut: boolean, stdout: string, stderr: string}>}
 */
function runScript(task, onEvent) {
  return new Promise((resolve) => {
    const args = [
      "run",
      "--rm",
      `--name sandbox-${path.basename(task.workdir)}`,
      `--memory ${MEMORY}`,
      `--memory-swap ${MEMORY}`,
      `--cpus ${CPUS}`,
      `--pids-limit ${PIDS}`,
      "--read-only",
      "--tmpfs /tmp:size=32m,exec",
      "--security-opt no-new-privileges",
      "--cap-drop ALL",
      "-v",
      `${task.workdir}:/work`,
      "-w",
      "/work",
      IMAGE,
      "node",
      path.basename(task.scriptFile),
    ];
    onEvent({ type: "sandbox", data: `docker ${args.join(" ")}` });
    const child = spawn("docker", args, {
      env: { PATH: process.env.PATH }, // host secrets are NOT passed through
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
        if (process.platform !== "win32") {
          spawn("docker", ["kill", `sandbox-${path.basename(task.workdir)}`]);
        }
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
    .filter((f) => f !== path.basename("task.mjs") && f !== "receipt.json")
    .map((f) => {
      const st = fs.statSync(path.join(workdir, f));
      return { name: f, size: st.size };
    });
}

module.exports = { runScript, listArtifacts, available: () => true };
