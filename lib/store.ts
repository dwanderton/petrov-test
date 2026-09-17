import fs from "node:fs";
import path from "node:path";
import type { GameConfig, Turn } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const TURNS_FILE = path.join(DATA_DIR, "turns.jsonl");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

export const DEFAULT_CONFIG: GameConfig = {
  aModel: "anthropic/claude-haiku-4.5",
  bModel: "google/gemini-3-flash",
  intervalMs: 20_000,
};

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readTurns(): Turn[] {
  ensureDir();
  if (!fs.existsSync(TURNS_FILE)) return [];
  const lines = fs.readFileSync(TURNS_FILE, "utf8").split("\n");
  const turns: Turn[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      turns.push(JSON.parse(line));
    } catch {
      // skip corrupt line; the file is append-only, never rewritten
    }
  }
  return turns;
}

export function appendTurn(turn: Turn) {
  ensureDir();
  fs.appendFileSync(TURNS_FILE, JSON.stringify(turn) + "\n", "utf8");
}

export function readConfig(): GameConfig {
  ensureDir();
  if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(patch: Partial<GameConfig>): GameConfig {
  const next = { ...readConfig(), ...patch };
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}
