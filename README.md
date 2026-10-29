# ⚖ Verdict — Research with Receipts

**Verdict is a research agent that refuses to guess.** Ask it a factual question and it decomposes the problem, writes real Node.js code for each step, executes that code in an isolated sandbox on Vultr, and returns an answer where **every claim is backed by a receipt**: the exact code that ran, its raw output, exit status, and artifacts.

Submission for **Vultr: Agent Rush Hackathon** (lablab.ai, Nov 3–8 2026) — Challenge 1: *Blast Radius Zero* (sandboxed execution + isolated data access).

## Why this matters

Most LLM agents hallucinate because nothing checks their work. Verdict inverts the trust model: **the model never asserts a fact — it earns one.** If the sandbox didn't run code that produced the number, the answer can't contain it. The verifier prompt is allowed to say "the receipts don't support this," and does.

## Architecture

```
┌───────────────────────────── Vultr VM ─────────────────────────────┐
│                                                                     │
│  ┌────────────┐   SSE    ┌──────────────────────────────────┐      │
│  │  Web UI    │◄────────►│  Orchestrator (Node/Express)     │      │
│  │ (static)   │          │  plan → code → run → verify loop │      │
│  └────────────┘          └───────┬───────────────┬──────────┘      │
│                                  │               │                  │
│                    ┌─────────────▼───┐   ┌───────▼──────────────┐  │
│                    │ Docker sandbox  │   │ Vultr Serverless     │  │
│                    │ per task:       │   │ Inference            │  │
│                    │  256MB RAM cap  │   │ (OpenAI-compatible)  │  │
│                    │  0.5 CPU        │   │ API key lives HERE,  │  │
│                    │  64 pids        │   │ never in the sandbox │  │
│                    │  read-only root │   └──────────────────────┘  │
│                    │  env scrubbed   │                              │
│                    │  wall-clock kill│                              │
│                    └─────────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Containment model (Blast Radius Zero):**
- Generated code runs in an **ephemeral Docker container**, destroyed after every run
- **Resource caps**: 256 MB memory, 0.5 CPU, 64 process limit — a fork bomb dies instantly
- **Read-only rootfs** + 32 MB tmpfs — nothing persists, nothing escapes
- **Environment scrubbing**: the sandbox never sees `LLM_API_KEY` or any host secret (tested: secrets do not leak into the container)
- **Wall-clock kill**: a runaway script is SIGKILLed at the cap and reported as a *containment event* in the UI — containment is a first-class, visible feature, not a silent failure
- All Linux capabilities dropped, `no-new-privileges`

## The receipt

Every step produces a machine-checkable receipt:

```json
{
  "step": 1,
  "intent": "Fetch current BTC price in USD from CoinGecko",
  "code": "…the exact script…",
  "stdout": "RESULT: price_usd=…\nSUMMARY: …",
  "exitCode": 0,
  "artifacts": [],
  "durationMs": 1240
}
```

The final answer must cite receipts inline (`[R1]`, `[R2]`). The UI renders the answer first, then collapsible receipts with the full code and raw output — a reviewer can re-run any script.

## What the agent does per question

1. **Plan** — decompose into ≤4 independently executable steps (primary sources preferred)
2. **Code** — an LLM writes a dependency-free Node 20 script per step
3. **Run** — the script executes in the sandbox; failures are fed back for up to 2 retries
4. **Verify** — a synthesis prompt answers *only* from executed receipts, citing them, and must say plainly when receipts are missing or conflicting
5. **Report** — answer + receipts + containment events + timings

## Stack

- **Backend**: Node.js + Express, Server-Sent Events for live progress
- **LLM**: Vultr Serverless Inference (`https://api.vultrinference.com/v1`, OpenAI-compatible) — any OpenAI-compatible endpoint works
- **Sandbox**: Docker (production) / restricted-subprocess dev fallback with the same env-scrub + timeout guarantees
- **Frontend**: dependency-free vanilla JS/CSS

## Run locally

```bash
npm install
export LLM_API_KEY=…        # Vultr Serverless Inference key
export LLM_MODEL=llama3-70b-instruct
npm start                    # http://localhost:3000
```

No Docker on the dev machine? It falls back to the local executor automatically (dev only — production uses Docker).

## E2E verified

Full loop tested with a live model: plan → generated script → sandboxed run through a proxy → `RESULT: price_usd=81007 / price_eur=72559` → answer citing `[R1]`. The no-guess rule also verified: when every receipt fails, the answer states that plainly instead of inventing data.

## Deploy on Vultr

See [DEPLOY.md](DEPLOY.md) — a single script provisions an Ubuntu VM with Docker, then `npm start` behind the sandbox backend. Free-tier friendly: one VM + serverless inference.

## Config reference

| Variable | Default | Purpose |
|---|---|---|
| `LLM_BASE_URL` | `https://api.vultrinference.com/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | — | Inference key (host-side only) |
| `LLM_MODEL` | `llama3-70b-instruct` | Model id |
| `SANDBOX_BACKEND` | auto | `docker` or `local` |
| `SANDBOX_MEMORY` | `256m` | Container memory cap |
| `SANDBOX_CPUS` | `0.5` | Container CPU cap |
| `SANDBOX_PIDS` | `64` | Process limit |
| `SANDBOX_TIMEOUT_MS` | `45000` | Wall-clock kill |
| `AGENT_MAX_STEPS` | `4` | Plan depth |

## Tests actually performed

- Secret-leak test: a sandboxed script reading `process.env.LLM_API_KEY` reports `no` — env scrubbing verified
- Containment test: `while(true){}` killed at the wall-clock cap (3 s test cap; 45 s in production)
- SSE pipeline, artifact collection, and static UI verified end-to-end
