import { LLMJSONParser } from "ai-json-fixer";

const llmJsonParser = new LLMJSONParser();

const REASONING_TAG_NAMES = ["think", "thinking", "analysis", "reasoning", "thought"];
const REASONING_TAG_PATTERN = REASONING_TAG_NAMES.join("|");

function stripMarkdownCodeFences(text: string): string {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\s*/m, "");
    cleaned = cleaned.replace(/\s*```\s*$/m, "");
  }

  return cleaned.trim();
}

function stripReasoningArtifacts(text: string): string {
  if (!text) return text;

  return text
    .replace(
      new RegExp(
        `<\\s*(${REASONING_TAG_PATTERN})\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*\\1\\s*>\\s*`,
        "gi"
      ),
      ""
    )
    .replace(new RegExp(`<\\s*\\/?\\s*(${REASONING_TAG_PATTERN})\\b[^>]*>`, "gi"), "")
    .trim();
}

function sanitizeLLMJsonText(raw: string): string {
  return stripReasoningArtifacts(stripMarkdownCodeFences(String(raw ?? ""))).trim();
}

function extractFirstJsonCandidate(text: string): string | null {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const start =
    objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  if (start === -1) return null;

  const opening = text[start];
  const closing = opening === "{" ? "}" : "]";
  const end = text.lastIndexOf(closing);
  if (end <= start) return null;
  return text.slice(start, end + 1).trim();
}

function normalizeLooseJson(text: string): string {
  return text.replace(/,\s*([}\]])/g, "$1").trim();
}

export function parseLLMJson<T>(raw: string): T | null {
  const cleaned = sanitizeLLMJsonText(raw);
  const extracted = extractFirstJsonCandidate(cleaned);
  const candidates = Array.from(new Set([cleaned, extracted].filter((v): v is string => !!v)));

  for (const candidate of candidates) {
    const variants = Array.from(new Set([candidate, normalizeLooseJson(candidate)]));
    for (const variant of variants) {
      const parsed = llmJsonParser.parse<T | string>(variant, {
        mode: "aggressive",
        stripMarkdown: true,
        trimTrailing: true,
        fixQuotes: true,
        addMissingCommas: true,
        completeStructure: true,
      });

      if (parsed == null) continue;
      if (typeof parsed === "string") {
        try {
          return JSON.parse(parsed) as T;
        } catch {
          continue;
        }
      }
      return parsed;
    }
  }

  return null;
}
