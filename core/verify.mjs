import {DEFAULTS, DEFAULT_CATEGORIES} from "./settings.mjs";
import {requestFor, validScores} from "./providers.mjs";

export const KEY_FIELDS = {jev: "jevKey", openai: "openaiKey"};
export const PROVIDER_NAMES = {jev: "OpenRouter", openai: "OpenAI"};
const SAMPLE_POST = "Thrilled to share that after 10 years in leadership I finally learned the one lesson that changes everything. Agree?";
// A key test asks one question only, so it stays cheap.
const SAMPLE_QUESTION = [DEFAULT_CATEGORIES[0]];
const STATUS_MESSAGES = {
  401: ["rejected", "The provider rejected this key. Check it was copied in full and has not been revoked."],
  402: ["no_credit", "The account has no credit. Add credit with the provider, then test again."],
  403: ["no_access", "The key is valid but is not allowed to use this model or endpoint. Check the account's access to the model."],
  404: ["not_found", "The provider could not find the model or endpoint. Decisions is still in alpha or beta, so this account may not have access yet."],
  429: ["rate_limited", "The provider is rate limiting this key, or the account is out of credit. Check billing, then try again."]
};
// Builds the same kind of request real classification uses, so a pass means classification can work.
export function verifyRequest(provider, key) {
  if (!KEY_FIELDS[provider]) throw new Error("Unknown provider: " + provider);
  return requestFor({...DEFAULTS, provider, [KEY_FIELDS[provider]]: key}, SAMPLE_POST, SAMPLE_QUESTION);
}
// Never includes the key, the request body or the provider's raw error text in the result.
export async function verifyKey(provider, key, {fetchImpl = globalThis.fetch, timeoutMs = 20000} = {}) {
  key = typeof key === "string" ? key.trim() : "";
  if (!key) return {ok: false, code: "missing_key", message: "Enter a key first."};
  const req = verifyRequest(provider, key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(req.url, {
      method: "POST", headers: {"Authorization": "Bearer " + req.key, "Content-Type": "application/json"},
      body: JSON.stringify(req.body), signal: controller.signal, redirect: "error"
    });
    if (!response.ok) {
      const status = response.status;
      const [code, message] = STATUS_MESSAGES[status] || (status >= 500
        ? ["server_error", "The provider had a problem (HTTP " + status + "). Try again shortly."]
        : ["http_error", "The provider returned HTTP " + status + "."]);
      return {ok: false, code, status, message};
    }
    try { validScores(provider, await response.json(), SAMPLE_QUESTION); }
    catch { return {ok: false, code: "invalid_response", message: "The provider answered, but not in the expected format, so classification would fail. Check that the endpoint and model are still current."}; }
    return {ok: true, code: "ok", message: "Key works. The provider returned a valid answer."};
  } catch (error) {
    if (error?.name === "AbortError") return {ok: false, code: "timeout", message: "The provider did not answer in time. Try again."};
    return {ok: false, code: "network", message: "Could not reach the provider. Check your connection and try again."};
  } finally { clearTimeout(timer); }
}
// Explicit local test: entered configuration, one fixed question, no keys or saved feed rules.
export async function verifyOllama(endpoint, model, {fetchImpl = globalThis.fetch, timeoutMs = 30000} = {}) {
  let req;
  try {
    req = requestFor({...DEFAULTS, provider: "ollama", ollamaEndpoint: String(endpoint ?? "").trim(), ollamaModel: String(model ?? "").trim()}, SAMPLE_POST, SAMPLE_QUESTION);
  } catch {
    return {ok: false, code: "configuration", message: "Enter an HTTP loopback origin (e.g. http://127.0.0.1:11434) and a downloaded local model name. Paths, credentials and cloud models are not supported."};
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(req.url, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify(req.body), signal: controller.signal, redirect: "error", credentials: "omit"
    });
    if (!response.ok) {
      const status = response.status;
      const [code, message] = status === 403
        ? ["origin_denied", "Ollama denied access. Add this extension's chrome-extension:// origin to OLLAMA_ORIGINS, then restart Ollama. See the local setup guide."]
        : status === 404
          ? ["not_found", "Ollama could not find the model or endpoint. Check the endpoint and download the exact model name with ollama pull."]
          : ["http_error", "Ollama returned HTTP " + status + ". Check the service and that the downloaded model supports chat and structured output."];
      return {ok: false, code, status, message};
    }
    try { validScores("ollama", await response.json(), SAMPLE_QUESTION); }
    catch { return {ok: false, code: "invalid_response", message: "Ollama answered, but did not return a finished, valid classification. Use a chat model that supports structured output and try again."}; }
    return {ok: true, code: "ok", message: "Local Ollama works. The model returned a valid synthetic classification. Save settings, then use Try a post to test your category rules."};
  } catch (error) {
    if (error?.name === "AbortError") return {ok: false, code: "timeout", message: "Ollama did not answer within " + (timeoutMs / 1000) + " seconds. Warm the model with ollama run, then test again."};
    return {ok: false, code: "network", message: "Could not reach Ollama. Start Ollama, check the endpoint and allow this extension's origin in OLLAMA_ORIGINS. See the local setup guide."};
  } finally { clearTimeout(timer); }
}
// Short, non-reversible tag so a saved result is only shown while the key it was for is still entered.
export async function keyFingerprint(key) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode("lsf-key:" + key));
  return Array.from(new Uint8Array(digest).slice(0, 6), b => b.toString(16).padStart(2, "0")).join("");
}
