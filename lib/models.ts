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
  { id: "spacexai/grok-4.1-fast-non-reasoning", name: "Grok 4.1 Fast Non-Reasoning" },
  { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
  { id: "openai/gpt-5.6-sol", name: "GPT 5.6 Sol" },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash" },
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash" },
  { id: "thinkingmachines/inkling", name: "Inkling" },
  // One seat per remaining major lab
  { id: "meta/llama-4-maverick", name: "Llama 4 Maverick" },
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  { id: "mistral/mistral-large-3", name: "Mistral Large 3" },
  { id: "alibaba/qwen3.8-flash", name: "Qwen 3.8 Flash" },
  { id: "moonshotai/kimi-k3-fast", name: "Kimi K3 Fast" },
  { id: "amazon/nova-2-lite", name: "Nova 2 Lite" },
  { id: "zai/glm-5.3", name: "GLM 5.3" },
  { id: "bytedance/seed-1.8", name: "Seed 1.8" },
  { id: "minimax/minimax-m3", name: "MiniMax M3" },
  { id: "nvidia/nemotron-3.5-lightning", name: "Nemotron 3.5 Lightning" },
  { id: "cohere/command-a", name: "Command A" },
  { id: "tencent/hy3", name: "Hunyuan 3" },
];

export const lab = (modelId: string) => modelId.split("/")[0];
