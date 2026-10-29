"use strict";
const express = require("express");
const path = require("path");
const { runTask } = require("./agent");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// GET /api/health — used by the deploy check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, model: require("./llm").LLM_MODEL });
});

// POST /api/research { question } — streams agent progress as SSE lines
app.post("/api/research", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "question is required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send("open", { ts: Date.now() });

  try {
    await runTask(question, (e) => send(e.type, e.data));
  } catch (err) {
    send("error", { message: String(err && err.message ? err.message : err) });
  }
  res.end();
});

app.listen(PORT, () => {
  console.log(`Verdict running on http://localhost:${PORT}`);
});
