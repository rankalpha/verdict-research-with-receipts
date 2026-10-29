# Deploying Verdict on a Vultr VM

## 1. Provision

Create an Ubuntu 22.04 Cloud Compute instance (1 vCPU / 1 GB is enough), open
TCP port 3000 (or put nginx/caddy in front), then SSH in and run:

```bash
curl -fsSL https://get.docker.com | sh
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs git
```

## 2. Get the inference key

In the Vultr console: **Products → AI → Serverless Inference** → create an
endpoint, copy the API key. Then:

```bash
git clone <your-fork> verdict && cd verdict
npm install
export LLM_API_KEY="vultr-…"
export LLM_MODEL="llama3-70b-instruct"     # pick from your endpoint
export SANDBOX_BACKEND=docker              # force the real sandbox
npm start
```

## 3. Verify

```bash
curl http://localhost:3000/api/health
# → {"ok":true,"model":"llama3-70b-instruct"}
```

Open `http://<vm-ip>:3000`, ask:

> Compare today's Bitcoin price in USD and EUR and the 24h change

Watch the plan, generated code, sandbox executions and receipts stream in.

## 4. Hardening notes (production)

- The sandbox network is Docker's default bridge. To restrict egress, attach
  the sandbox to a dedicated network with a firewall (or run with
  `--network none` for offline-only tasks — set `SANDBOX_NETWORK`).
- Run the orchestrator as a non-root user under systemd
  (`Restart=always`, `Environment=LLM_API_KEY=…`).
- The inference key exists only in the orchestrator's environment and is
  never passed into sandbox containers (verified by test).
