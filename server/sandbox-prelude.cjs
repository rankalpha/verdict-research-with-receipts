"use strict";
/**
 * Node prelude loaded via `node --require` before every sandboxed script.
 * If a proxy is configured in the environment (dev machines behind firewalls),
 * route all global fetch() traffic through it. On the Vultr VM no proxy env is
 * set and this is a no-op.
 */
try {
  const proxy =
    process.env.HTTPS_PROXY || process.env.https_proxy ||
    process.env.HTTP_PROXY || process.env.http_proxy;
  if (proxy) {
    const { ProxyAgent, setGlobalDispatcher } = require("undici");
    setGlobalDispatcher(new ProxyAgent(proxy));
  }
} catch {
  // never block a task because the proxy layer failed to initialize
}
