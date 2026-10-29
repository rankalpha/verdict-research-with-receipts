"use strict";

const $ = (sel) => document.querySelector(sel);
const feed = $("#feed");
const report = $("#report");
const askBtn = $("#ask-btn");
const questionBox = $("#question");

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function addCard(title, body, cls) {
  const card = el("div", "card " + (cls || ""));
  const head = el("div", "card-head", title);
  card.append(head);
  if (body) card.append(body);
  feed.append(card);
  card.scrollIntoView({ behavior: "smooth", block: "end" });
  return card;
}

function pre(text) {
  const p = el("pre");
  p.textContent = text;
  return p;
}

document.querySelectorAll(".example").forEach((b) =>
  b.addEventListener("click", () => {
    questionBox.value = b.textContent.trim();
  })
);

async function loadHealth() {
  try {
    const r = await fetch("/api/health");
    const j = await r.json();
    $("#model-badge").textContent = "model: " + j.model;
    const be = localStorage.getItem("sandboxBackend") || j.backend || "auto";
    $("#backend-badge").textContent = "sandbox: " + be;
    askBtn.disabled = false;
    askBtn.textContent = "Ask Verdict";
  } catch {
    $("#backend-badge").textContent = "server unreachable";
    askBtn.textContent = "Server offline";
  }
}

askBtn.addEventListener("click", run);
questionBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
});

function run() {
  const q = questionBox.value.trim();
  if (!q) return;
  feed.innerHTML = "";
  feed.hidden = false;
  report.hidden = true;
  report.innerHTML = "";
  askBtn.disabled = true;

  fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: q }),
  }).then(async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let event = "message";
        const lines = chunk.split("\n");
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) event = line.slice(7).trim();
          if (line.startsWith("data: ")) data += line.slice(6);
        }
        if (!data) continue;
        try {
          handle(event, JSON.parse(data));
        } catch {}
      }
    }
    askBtn.disabled = false;
  }).catch((err) => {
    addCard("Connection error", el("p", "", String(err)), "error");
    askBtn.disabled = false;
  });
}

const state = { codeCards: {}, containment: [] };

function handle(event, data) {
  switch (event) {
    case "open":
      break;
    case "status":
      if (!state.statusCard) state.statusCard = addCard("Status", null, "status");
      state.statusCard.querySelector(".card-head").textContent = "Status — " + data;
      break;
    case "plan": {
      const list = el("ol", "plan");
      data.forEach((s) => list.append(el("li", "", s.intent)));
      addCard("Plan (" + data.length + " steps)", list);
      break;
    }
    case "step_start":
      state.currentStep = data.index;
      addCard("Step " + (data.index + 1) + ": " + data.intent, null, "step");
      break;
    case "code": {
      const c = addCard("Generated code (step " + (data.index + 1) + ")", pre(data.code), "code");
      state.codeCards[data.index] = c;
      break;
    }
    case "sandbox":
      addCard("Sandbox", el("p", "mono", data), "sandbox");
      break;
    case "contained":
      addCard("⚠ Containment", el("p", "", "Runaway or non-terminating execution was terminated by the sandbox wall-clock cap. No host resources, credentials, or state were exposed."), "contained");
      state.containment.push(data);
      break;
    case "output": {
      const body = el("div");
      body.append(el("p", "mono dim", `exit=${data.exitCode} timedOut=${data.timedOut}`));
      if (data.stdout) body.append(pre(data.stdout));
      if (data.stderr) body.append(pre("stderr:\n" + data.stderr));
      addCard("Execution output (step " + (data.index + 1) + ")", body);
      break;
    }
    case "step_end":
      break;
    case "done":
      state.statusCard?.querySelector(".card-head")?.remove();
      renderReport(data);
      break;
    case "error":
      addCard("Error", el("p", "", data.message), "error");
      break;
  }
}

function renderReport(data) {
  report.hidden = false;
  report.innerHTML = "";

  const answer = el("div", "card answer");
  answer.append(el("div", "card-head", "Verdict"));
  const ansBody = el("div", "answer-body");
  data.answer.split("\n").forEach((line) => ansBody.append(el("p", "", line)));
  answer.append(ansBody);
  report.append(answer);

  const meta = el("p", "meta", `${data.receipts.length} receipts · ${data.containment.length} containment events · total ${(data.totalMs / 1000).toFixed(1)}s · model ${data.model} · sandbox ${data.backend}`);
  report.append(meta);

  data.receipts.forEach((r) => {
    const d = el("details", "card receipt");
    const s = el("summary", "", `[R${r.step}] ${r.intent}`);
    d.append(s);
    d.append(el("div", "receipt-meta", `exit=${r.exitCode} · artifacts: ${r.artifacts.map((a) => a.name).join(", ") || "none"}`));
    d.append(el("h4", "", "Code that ran"));
    d.append(pre(r.code));
    d.append(el("h4", "", "Raw output"));
    d.append(pre(r.stdout));
    report.append(d);
  });
  report.scrollIntoView({ behavior: "smooth", block: "start" });
}

loadHealth();
