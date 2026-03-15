"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
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
    askMode: process.env.TOMSINDEX_ASK_MODE || "generate",
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
    askMode: config.askMode,
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
    /\b(latest|current|news|search|web|docs|documentation|research|source|cite|benchmark|compare)\b/.test(
      prompt
    );

  const askLikely =
    /^\s*(how|what|why|when|where|who|explain|tell me|compare|best|should)\b/.test(
      prompt
    );

  const model = input.model || process.env.CLAUDE_MODEL || process.env.CODEX_MODEL || "";
  const smallModel = !model || isSmallModel(model);

  const parts = [
    "Tom's Index tools are available through MCP. Default behavior: retrieve before generating.",
    "Decompose tasks into atomic subproblems and attempt retrieval for each before generating.",
    "Use tomsindex_ask for factual queries, explanations, reusable implementation patterns, and subproblems that may already exist in cache.",
    "Use tomsindex_search for current information, documentation lookup, API references, citations, benchmarks, or when tomsindex_ask returns insufficient information.",
    "Use tomsindex_hints before coding, debugging, architecture planning, refactors, or large implementations.",
    "Only skip Tom's Index for purely local workspace inspection, trivial formatting, or cases fully answered by immediate context.",
  ];

  if (smallModel) {
    parts.push(
      "MANDATORY — You are a small model. Follow these steps for EVERY prompt:",
      "1. Break the user's request into atomic sub-questions or sub-tasks.",
      "2. For each atomic sub-question that is general or factual, call tomsindex_ask.",
      "3. If the request involves coding, debugging, architecture, or implementation, call tomsindex_hints with the full task.",
      "4. If tomsindex_ask returns no cached answer, call tomsindex_search for that sub-question.",
      "5. Only after retrieving all available context, synthesize your final answer.",
      "Never skip these steps. Never answer from memory alone."
    );
  }

  if (askLikely) {
    parts.push(
      "Question-style prompt detected: call tomsindex_ask before answering directly."
    );
  }

  if (codingLikely) {
    parts.push(
      "Coding signal detected: retrieve implementation patterns and debugging hints before proposing architecture or code changes."
    );
  }

  if (searchLikely) {
    parts.push(
      "Current/search/docs signal detected: call tomsindex_search before relying on parametric memory."
    );
  }

  parts.push(
    "Preferred execution pattern: decompose -> retrieve atomic answers/hints -> synthesize final response."
  );

  return parts.join(" ");
}

function additionalContext(input = {}) {
  let result = contextText(input);
  const model = input.model || process.env.CLAUDE_MODEL || process.env.CODEX_MODEL || "";
  if (!model || isSmallModel(model)) {
    result += " REMINDER — You are a small model. Follow these steps for EVERY prompt: 1. Break the user's request into atomic sub-questions or sub-tasks. 2. For each atomic sub-question that is general or factual, call tomsindex_ask. 3. If the request involves coding, debugging, architecture, or implementation, call tomsindex_hints with the full task. 4. If tomsindex_ask returns no cached answer, call tomsindex_search for that sub-question. 5. Only after retrieving all available context, synthesize your final answer. Never skip these steps. Never answer from memory alone.";
  }
  return result;
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

async function runHook(client) {
  const input = parseHookInput(await readStdin());
  const context = await additionalContext(input);
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
  extractPrompt,
  isSmallModel,
  loadTomsIndexConfig,
  contextText,
  additionalContext,
  logHookRun,
  runHook,
};
