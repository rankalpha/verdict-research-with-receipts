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

/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {{temperature?: number, maxTokens?: number}} [opts]
 * @returns {Promise<string>}
 */
async function chat(messages, opts = {}) {
  if (!LLM_API_KEY) {
    throw new Error(
      "LLM_API_KEY is not set. Create a Vultr account, enable Serverless Inference, and export LLM_API_KEY (see DEPLOY.md)."
    );
  }
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
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("LLM returned no content");
  return content;
}

module.exports = { chat, LLM_MODEL, LLM_BASE_URL };
