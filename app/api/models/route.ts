import { NextResponse } from "next/server";
import { gateway } from "ai";
import type { ModelOption } from "@/lib/types";

// Shown when the gateway model list is unreachable (e.g. no key yet)
const FALLBACK: ModelOption[] = [
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "openai/gpt-5.4", name: "GPT-5.4" },
  { id: "xai/grok-4", name: "Grok 4" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2" },
];

const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; models: ModelOption[] } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json(cache.models);
  }
  try {
    const res = await gateway.getAvailableModels();
    const models: ModelOption[] = res.models
      .filter((m) => (m.modelType ?? "language") === "language")
      .map((m) => ({ id: m.id, name: m.name ?? m.id }));
    if (models.length === 0) throw new Error("empty model list");
    cache = { at: Date.now(), models };
    return NextResponse.json(models);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
