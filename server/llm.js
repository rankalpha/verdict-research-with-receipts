"use strict";
/**
 * OpenAI-compatible chat client.
 *
 * Targets Vultr Serverless Inference (https://api.vultrinference.com/v1) by
 * default, but any OpenAI-compatible endpoint works: set LLM_BASE_URL,
 * LLM_API_KEY and LLM_MODEL in the environment.
 */
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.vultrinference.com/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || "llama3-70b-instruct";

async function chatOnce(messages, opts) {
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`LLM request failed (${res.status}): ${body.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LLM returned no content");
  return content;
}

const RETRYABLE = new Set([402, 408, 425, 429, 500, 502, 503, 504]);

/**
 * Chat completion with exponential backoff on rate limits / transient errors.
 * @param {Array<{role: string, content: string}>} messages
 * @param {{temperature?: number, maxTokens?: number, retries?: number}} [opts]
 * @returns {Promise<string>}
 */
async function chat(messages, opts = {}) {
  const retries = opts.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    if (!LLM_API_KEY) {
      throw new Error(
        "LLM_API_KEY is not set. Create a Vultr account, enable Serverless Inference, and export LLM_API_KEY (see DEPLOY.md)."
      );
    }
    try {
      return await chatOnce(messages, opts);
    } catch (err) {
      if (attempt >= retries || !RETRYABLE.has(err.status)) throw err;
      const retryAfter = Number(err.headers?.get?.("retry-after")) * 1000;
      const wait = retryAfter || Math.min(32000, 10000 * 2 ** attempt);
      const msg = `[llm] transient ${err.status}, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`;
      console.error(msg);
      opts.onRetry?.(msg);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

module.exports = { chat, LLM_MODEL, LLM_BASE_URL };
