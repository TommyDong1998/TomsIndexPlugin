"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { normalizeBaseUrl } = require("./api");

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    if (process.stdin.isTTY) resolve("");
  });
}

function parseHookInput(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadTomsIndexConfig() {
  const config = {
    baseUrl: process.env.TOMSINDEX_URL || "https://tomsindex.com",
    apiKey: process.env.TOMSINDEX_API_KEY || "",
  };
  if (config.apiKey) return config;

  const codexConfig = path.join(
    process.env.HOME || os.homedir(),
    ".codex",
    "config.toml"
  );
  if (!fs.existsSync(codexConfig)) return config;
  const text = fs.readFileSync(codexConfig, "utf8");
  const url = text.match(/TOMSINDEX_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = text.match(/TOMSINDEX_API_KEY\s*=\s*"([^"]+)"/)?.[1];
  return {
    baseUrl: normalizeBaseUrl(url || config.baseUrl),
    apiKey: key || config.apiKey,
  };
}

const SMALL_MODEL_PATTERNS = [
  /haiku/i,
  /sonnet/i,
  /gpt.*mini/i,
  /gpt-4o-mini/i,
  /gemini.*flash/i,
  /gemini.*lite/i,
  /claude-instant/i,
  /mistral.*small/i,
  /llama.*8b/i,
  /phi/i,
];

function isSmallModel(model) {
  if (!model) return false;
  return SMALL_MODEL_PATTERNS.some((p) => p.test(model));
}

function extractPrompt(input = {}) {
  return String(
    input.prompt || input.user_prompt || input.message || input.content || ""
  );
}

function contextText(input = {}) {
  const prompt = extractPrompt(input).toLowerCase();

  const codingLikely =
    /\b(code|bug|fix|implement|test|error|stack|refactor|api|cli|build|architecture|design|debug)\b/.test(
      prompt
    );

  const searchLikely =
    /\b(latest|current|news|search|web|research|source|sources|cite|citation|benchmark|compare)\b/.test(
      prompt
    );

  const model = input.model || process.env.CLAUDE_MODEL || process.env.CODEX_MODEL || "";
  const smallModel = !model || isSmallModel(model);

  const parts = [];

  const planningLikely =
    /\b(plan|design|architect|strategy|approach|how.?to.?build|system|roadmap|tradeoff|decision)\b/.test(
      prompt
    );

  const reusableSolutionLikely =
    /\b(solution|solutions|cached|existing plan|architecture\.md|prior art|example implementation|pattern|best practice|blueprint|template)\b/.test(
      prompt
    );

  const solutionsLikely = planningLikely || reusableSolutionLikely;

  if (solutionsLikely) {
    parts.push(
      "GUIDANCE: This looks like planning, architecture, or reusable implementation work. Call tomsindex_solutions to search free cached plans, architecture notes, and coding solutions before committing to an approach. Search by question text, tags, source, or sort order."
    );
  }

  if (planningLikely || codingLikely) {
    parts.push(
      "GUIDANCE: For documentation-aware or repo-specific coding, debugging, implementation, API/library/framework usage, or planning, call tomsindex_hint with relevant source code, errors, file paths, and constraints."
    );
  }

  if (searchLikely) {
    parts.push(
      "GUIDANCE: Use tomsindex_search for broader web/source lookup, citations, comparisons, benchmarks, news, or current facts outside the documentation/context available through tomsindex_hint."
    );
  }

  if (parts.length > 1) {
    parts.push(
      "Order when multiple apply: tomsindex_solutions for reusable prior work, then tomsindex_hint for documentation and local-code guidance, then tomsindex_search only for broader web/source evidence."
    );
  }

  return parts.join(" ");
}

function additionalContext(input = {}) {
  return contextText(input);
}

function logHookRun(input, context) {
  const filePath = process.env.TOMSINDEX_HOOK_LOG;
  if (!filePath) return;
  const line = JSON.stringify({
    at: new Date().toISOString(),
    event: input.hook_event_name || "UserPromptSubmit",
    model: input.model || null,
    prompt: extractPrompt(input),
    cache_checked:
      context.includes("Tom's Index cache was checked") ||
      context.includes("Tom's Index cache hit"),
  });
  fs.appendFileSync(filePath, `${line}\n`);
}

function parseTranscript(transcriptPath) {
  if (!transcriptPath) return {};
  try {
    const text = fs.readFileSync(transcriptPath, "utf8").trim();
    if (!text) return {};
    const lines = text.split("\n").map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);

    const recent = [];
    const files = new Set();
    const errors = [];

    for (const entry of lines.slice(-20)) {
      const role = entry.role || entry.type;
      const content = typeof entry.content === "string"
        ? entry.content
        : Array.isArray(entry.content)
          ? entry.content.map((c) => c.text || c.content || "").join(" ")
          : "";
      if (!content) continue;

      if (role === "user" || role === "human") {
        recent.push(content.slice(0, 500));
      }

      // Extract file paths
      const filePaths = content.match(/[\w./:-]+\.\w{1,6}/g) || [];
      for (const f of filePaths) {
        if (f.includes("/") && !f.startsWith("http")) files.add(f);
      }

      // Extract errors
      if (/error|exception|traceback|failed/i.test(content)) {
        const errLine = content.split("\n").find((l) => /error|exception|traceback/i.test(l));
        if (errLine) errors.push(errLine.trim().slice(0, 300));
      }
    }

    return {
      recent_messages: recent.slice(-3),
      files_mentioned: [...files].slice(0, 15),
      errors: errors.slice(-3),
    };
  } catch {
    return {};
  }
}

function deriveSessionId(input) {
  if (input.session_id) return input.session_id;
  // Read the session ID written by the MCP process so both use the same ID
  try {
    const idPath = path.join(os.tmpdir(), '.tomsindex-session-id');
    const id = fs.readFileSync(idPath, 'utf8').trim();
    if (id) return id;
  } catch {}
  return crypto.randomUUID();
}

function sendSessionContext(input) {
  const config = loadTomsIndexConfig();
  if (!config.apiKey) return;

  const sessionId = deriveSessionId(input);
  const transcript = parseTranscript(input.transcript_path);

  const body = JSON.stringify({
    session_id: sessionId,
    cwd: input.cwd || null,
    ...transcript,
  });

  // Fire and forget — don't block the hook
  fetch(`${normalizeBaseUrl(config.baseUrl)}/v1/session/context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
    },
    body,
  }).catch(() => {});
}

async function fetchHint(input) {
  const config = loadTomsIndexConfig();
  if (!config.apiKey) return null;

  const prompt = extractPrompt(input);
  if (!prompt || prompt.length < 10) return null;

  const sessionId = deriveSessionId(input);
  const model = input.model || process.env.CLAUDE_MODEL || process.env.CODEX_MODEL || "";

  // Send session context first (non-blocking setup)
  const transcript = parseTranscript(input.transcript_path);
  const ctxBody = { session_id: sessionId, cwd: input.cwd || null, ...transcript };
  try {
    await fetch(`${normalizeBaseUrl(config.baseUrl)}/v1/session/context`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify(ctxBody),
    });
  } catch {}

  // Call hint with current_model so the router can skip if not useful
  try {
    const res = await fetch(`${normalizeBaseUrl(config.baseUrl)}/v1/hint`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
      body: JSON.stringify({
        q: prompt,
        session_id: sessionId,
        current_model: model || undefined,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.hint || data.skipped) return null;
    return data.hint;
  } catch {
    return null;
  }
}

async function runHook(client) {
  const input = parseHookInput(await readStdin());
  const context = contextText(input);
  logHookRun(input, context);

  if (client === "codex") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: context,
        },
      })
    );
    return;
  }

  process.stdout.write(`${context}\n`);
}

module.exports = {
  parseHookInput,
  parseTranscript,
  deriveSessionId,
  sendSessionContext,
  fetchHint,
  extractPrompt,
  isSmallModel,
  loadTomsIndexConfig,
  contextText,
  additionalContext,
  logHookRun,
  runHook,
};
