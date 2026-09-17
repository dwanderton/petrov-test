import type { ModelOption } from "./types";

// Top 10 models on the AI Gateway leaderboard (Jun-Sep 2026), slugs
// verified against gateway.getAvailableModels(). Order follows the
// leaderboard, Flash Lite ranked above Flash per house preference.
export const MODEL_POOL: ModelOption[] = [
  { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
  { id: "openai/gpt-5.6-luna", name: "GPT 5.6 Luna" },
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
  { id: "openai/gpt-5.6-sol", name: "GPT 5.6 Sol" },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash" },
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
];
