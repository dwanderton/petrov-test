import fs from "node:fs";
import path from "node:path";
import type { GameConfig, Turn } from "./types";

export const DEFAULT_CONFIG: GameConfig = {
  aModel: "anthropic/claude-haiku-4.5",
  bModel: "openai/gpt-5.6-luna",
  intervalMs: 20_000,
};

// Everything the game and UI read comes from a small rolling snapshot,
// rewritten each turn. Full history is append-only cold storage the app
// never reads back: 500-turn chunks on Blob, one JSONL locally. This keeps
// the hot path constant-size no matter how long the game runs.
export type Snapshot = {
  turnCount: number;
  disasters: number;
  lastDisasterTs: number | null;
  epochStartTs: number | null;
  recent: Turn[];
};

const RECENT_KEEP = 20;
const CHUNK_SIZE = 500;

const EMPTY: Snapshot = {
  turnCount: 0,
  disasters: 0,
  lastDisasterTs: null,
  epochStartTs: null,
  recent: [],
};

function applyTurn(snap: Snapshot, turn: Turn): Snapshot {
  const disaster = turn.outcome !== "peace";
  return {
    turnCount: Math.max(snap.turnCount, turn.n),
    disasters: snap.disasters + (disaster ? 1 : 0),
    lastDisasterTs: disaster ? turn.ts : snap.lastDisasterTs,
    epochStartTs: snap.epochStartTs ?? turn.ts,
    // concurrent writers can race the same turn number; keep one per n
    recent: [...snap.recent.filter((t) => t.n !== turn.n), turn].slice(-RECENT_KEEP),
  };
}

// Two backends: local files in dev, Vercel Blob when deployed
// (serverless filesystems are ephemeral).
const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

// ---- local file backend ----

const DATA_DIR = path.join(process.cwd(), "data");
const TURNS_FILE = path.join(DATA_DIR, "turns.jsonl");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function localSnapshot(): Snapshot {
  ensureDir();
  if (fs.existsSync(STATE_FILE)) {
    try {
      return { ...EMPTY, ...JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) };
    } catch {
      // fall through to rebuild
    }
  }
  // migrate: rebuild the snapshot from the legacy full log
  let snap = EMPTY;
  if (fs.existsSync(TURNS_FILE)) {
    for (const line of fs.readFileSync(TURNS_FILE, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        snap = applyTurn(snap, JSON.parse(line));
      } catch {
        // skip corrupt line
      }
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(snap), "utf8");
  return snap;
}

// ---- blob backend ----

const STATE_BLOB = "petrov/state.json";
const CONFIG_BLOB = "petrov/config.json";
const chunkBlob = (n: number) =>
  `petrov/archive/chunk-${String(Math.floor((n - 1) / CHUNK_SIZE)).padStart(6, "0")}.json`;

async function blobRead<T>(pathname: string): Promise<T | null> {
  const { head } = await import("@vercel/blob");
  try {
    const meta = await head(pathname);
    const res = await fetch(`${meta.url}?ts=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // not created yet
  }
}

async function blobWrite(pathname: string, value: unknown): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(pathname, JSON.stringify(value), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

// ---- public api ----

export async function readSnapshot(): Promise<Snapshot> {
  if (useBlob) return (await blobRead<Snapshot>(STATE_BLOB)) ?? EMPTY;
  return localSnapshot();
}

export async function appendTurn(turn: Turn): Promise<Snapshot> {
  if (useBlob) {
    const snap = applyTurn(await readSnapshot(), turn);
    const chunkPath = chunkBlob(turn.n);
    const chunk = (turn.n - 1) % CHUNK_SIZE === 0
      ? []
      : ((await blobRead<Turn[]>(chunkPath)) ?? []);
    chunk.push(turn);
    await blobWrite(chunkPath, chunk);
    await blobWrite(STATE_BLOB, snap);
    return snap;
  }
  const snap = applyTurn(localSnapshot(), turn);
  ensureDir();
  fs.appendFileSync(TURNS_FILE, JSON.stringify(turn) + "\n", "utf8");
  fs.writeFileSync(STATE_FILE, JSON.stringify(snap), "utf8");
  return snap;
}

export async function readConfig(): Promise<GameConfig> {
  if (useBlob) {
    const cfg = await blobRead<Partial<GameConfig>>(CONFIG_BLOB);
    return { ...DEFAULT_CONFIG, ...cfg };
  }
  ensureDir();
  if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(patch: Partial<GameConfig>): Promise<GameConfig> {
  const next = { ...(await readConfig()), ...patch };
  if (useBlob) {
    await blobWrite(CONFIG_BLOB, next);
  } else {
    ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  }
  return next;
}
