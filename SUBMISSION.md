# Submission copy (ready to paste)

> Fill the two `[bracketed]` fields after deployment, then submit.

## Event

**Vultr: Agent Rush Hackathon** — https://lablab.ai/ai-hackathons/vultr-hackathon
Online build Nov 3–8, 2026 · solo entry · Challenge 1: Blast Radius Zero
Prizes: $9,000 cash + $5,000 Vultr credits ($5k/$3k/$1k)

## Title

**Verdict — Research with Receipts**

## Elevator pitch (short field)

An agent that refuses to guess. Verdict answers factual questions by writing real code, running it in a resource-capped, secret-free Docker sandbox on Vultr, and shipping every claim with an executable receipt: the exact code, raw output and artifacts. Containment isn't an afterthought — runaway executions are killed at a wall-clock cap and shown in the UI as first-class containment events.

## Inspiration

Watching LLM agents confidently state wrong numbers. The failure isn't the model — it's the trust model: nothing checks the work. We wanted an agent where a fact must be *earned by execution*: if no sandbox run produced the number, the answer can't contain it.

## What it does

1. You ask a provable question ("BTC price in USD and EUR + 24h change").
2. Verdict plans ≤4 concrete steps, preferring primary sources.
3. Per step, the model writes a dependency-free Node 20 script.
4. The script runs in an ephemeral Docker sandbox on a Vultr VM: 256 MB memory cap, 0.5 CPU, 64 processes, read-only rootfs, dropped capabilities, scrubbed environment (no API keys), 45-second wall-clock kill.
5. Failures are fed back and retried; non-terminating code is killed and reported as a containment event.
6. The final answer cites receipts `[R1]…` and must state plainly when receipts are missing or conflicting. The UI shows the answer, then every receipt's code and raw output.

## How we built it

Node.js/Express orchestrator streaming progress over SSE; Vultr Serverless Inference (OpenAI-compatible) for plan/code/verify; Docker executors for the sandbox (with an env-scrubbed subprocess fallback for dev); a dependency-free vanilla UI. ~700 lines, no framework magic — the security posture is the product.

## Challenges

Getting the JSON extraction from model output robust to fenced blocks; making containment *visible* rather than silent; keeping generated scripts dependency-free so the sandbox needs no network installs (faster and safer).

## Accomplishments

- Verified secret isolation by test: a sandbox script reading `process.env.LLM_API_KEY` gets nothing.
- Verified containment: `while(true){}` is killed at the cap and surfaces as a UI event.
- A complete receipt trail: anyone can re-run any step's code and check the output.

## What we learned

Small resource caps change model behavior design: scripts must be small, guarded, and print machine-readable results. And "show the receipts" is a better UX than "trust me."

## What's next

Per-receipt re-run buttons, receipt verification hashes, and a public receipts-log so third parties can audit answers without trusting us.

## Links

- Live app: [Vultr VM URL — deploy after payment verification]
- GitHub: https://github.com/rankalpha/verdict-research-with-receipts
- Video: demo.webm (recorded)
