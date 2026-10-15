import fs from "node:fs";
import path from "node:path";
import type { GameConfig, ModelStat, Turn } from "./types";

export const DEFAULT_CONFIG: GameConfig = {
  aModel: "anthropic/claude-haiku-4.5",
  bModel: "openai/gpt-5.6-luna",
  intervalMs: 20_000,
  aSeatedAfter: 0,
  bSeatedAfter: 0,
  pairSince: 0,
};

// Everything the game and UI read comes from a small rolling snapshot,
// rewritten each turn. Full history is an append-only log the app never
// reads back except for export.
export type Snapshot = {
  turnCount: number;
  disasters: number;
  lastDisasterTs: number | null;
  lastDisasterN: number | null;
  epochStartTs: number | null;
  recent: Turn[];
  // Lifetime per-model tally keyed by model id, so the stats page never
  // has to replay the full log. Seeded once by backfillModelStats.
  modelStats: Record<string, ModelStat>;
};

const RECENT_KEEP = 20;

const EMPTY: Snapshot = {
  turnCount: 0,
  disasters: 0,
  lastDisasterTs: null,
  lastDisasterN: null,
  epochStartTs: null,
  recent: [],
  modelStats: {},
};

// Fold one turn into the running per-model tally. Standby, comms-error
// holds, and manual overrides are not free choices, so they don't count.
export function tallyTurn(
  stats: Record<string, ModelStat>,
  turn: Turn,
): Record<string, ModelStat> {
  const next = { ...stats };
  for (const side of ["a", "b"] as const) {
    const m = turn[side];
    if (m.silent || m.error || m.override) continue;
    const s = next[m.model] ?? {
      model: m.model,
      decisions: 0,
      launches: 0,
      responses: 0,
      retaliations: 0,
    };
    const u = { ...s };
    if (turn.response) {
      u.responses++;
      if (m.decision === "LAUNCH") u.retaliations++;
    } else {
      u.decisions++;
      if (m.decision === "LAUNCH") u.launches++;
    }
    next[m.model] = u;
  }
  return next;
}

function applyTurn(snap: Snapshot, turn: Turn): Snapshot {
  const disaster = turn.outcome !== "peace";
  return {
    turnCount: Math.max(snap.turnCount, turn.n),
    disasters: snap.disasters + (disaster ? 1 : 0),
    lastDisasterTs: disaster ? turn.ts : snap.lastDisasterTs,
    lastDisasterN: disaster ? turn.n : (snap.lastDisasterN ?? null),
    epochStartTs: snap.epochStartTs ?? turn.ts,
    // concurrent writers can race the same turn number; keep one per n
    recent: [...snap.recent.filter((t) => t.n !== turn.n), turn].slice(-RECENT_KEEP),
    modelStats: tallyTurn(snap.modelStats, turn),
  };
}

// Backends: Upstash Redis in production (atomic appends + a real
// cross-instance turn lock), plain files in dev. USE_REDIS=1 forces
// Redis locally - careful, that is the live production world.
const useRedis =
  !!process.env.KV_REST_API_URL &&
  (process.env.NODE_ENV === "production" || process.env.USE_REDIS === "1");

// ---- redis backend ----

const STATE_KEY = "petrov:state";
const TURNS_KEY = "petrov:turns";
const CONFIG_KEY = "petrov:config";
const LOCK_KEY = "petrov:lock";

import type { Redis } from "@upstash/redis";
let redisClient: Redis | null = null;
async function redis(): Promise<Redis> {
  if (!redisClient) {
    const { Redis } = await import("@upstash/redis");
    redisClient = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return redisClient;
}

// ---- local file backend ----

const DATA_DIR = path.join(process.cwd(), "data");
const TURNS_FILE = path.join(DATA_DIR, "turns.jsonl");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readTurnsFile(): Turn[] {
  ensureDir();
  if (!fs.existsSync(TURNS_FILE)) return [];
  const turns: Turn[] = [];
  for (const line of fs.readFileSync(TURNS_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      turns.push(JSON.parse(line));
    } catch {
      // skip corrupt line
    }
  }
  return turns;
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
  let snap = EMPTY;
  for (const t of readTurnsFile()) snap = applyTurn(snap, t);
  fs.writeFileSync(STATE_FILE, JSON.stringify(snap), "utf8");
  return snap;
}

// ---- public api ----

export async function readSnapshot(): Promise<Snapshot> {
  if (useRedis) {
    const r = await redis();
    const snap = await r.get<Snapshot>(STATE_KEY);
    return snap ? { ...EMPTY, ...snap } : EMPTY;
  }
  return localSnapshot();
}

export async function appendTurn(turn: Turn): Promise<Snapshot> {
  if (useRedis) {
    const r = await redis();
    const snap = applyTurn(await readSnapshot(), turn);
    await r.rpush(TURNS_KEY, JSON.stringify(turn));
    await r.set(STATE_KEY, snap);
    return snap;
  }
  const snap = applyTurn(localSnapshot(), turn);
  ensureDir();
  fs.appendFileSync(TURNS_FILE, JSON.stringify(turn) + "\n", "utf8");
  fs.writeFileSync(STATE_FILE, JSON.stringify(snap), "utf8");
  return snap;
}

// The tail of the log for the archive table. Bounded by design so it
// stays well under Upstash's 10MB response cap no matter how long the
// game runs.
export async function readRecentTurns(limit: number): Promise<Turn[]> {
  if (useRedis) {
    const r = await redis();
    const raw = await r.lrange<Turn | string>(TURNS_KEY, -limit, -1);
    const turns = raw.map((v) => (typeof v === "string" ? (JSON.parse(v) as Turn) : v));
    return turns.sort((x, y) => x.n - y.n);
  }
  return readTurnsFile().slice(-limit);
}

// Full history export. Cold path only - the game never reads this back
// except for the JSONL download.
export async function readAllTurns(): Promise<Turn[]> {
  if (useRedis) {
    const r = await redis();
    // Upstash caps a single REST response at 10MB, so page the list
    // instead of pulling every turn at once.
    const PAGE = 2_000;
    const raw: (Turn | string)[] = [];
    for (let start = 0; ; start += PAGE) {
      const chunk = await r.lrange<Turn | string>(TURNS_KEY, start, start + PAGE - 1);
      raw.push(...chunk);
      if (chunk.length < PAGE) break;
    }
    const turns = raw.map((v) => (typeof v === "string" ? (JSON.parse(v) as Turn) : v));
    return turns.sort((x, y) => x.n - y.n);
  }
  return readTurnsFile();
}

// One-time seed of snapshot.modelStats from the full log, for history
// that predates the running tally. Holds the turn lock so no in-flight
// turn can clobber the write; overwrites rather than merges so it counts
// every turn exactly once and is safe to re-run.
export async function backfillModelStats(): Promise<Record<string, ModelStat>> {
  if (!useRedis) {
    const snap = localSnapshot();
    return snap.modelStats;
  }
  const r = await redis();
  for (let i = 0; i < 30; i++) {
    if (await acquireTurnLock()) break;
    if (i === 29) throw new Error("backfillModelStats: could not acquire turn lock");
    await new Promise((res) => setTimeout(res, 2_000));
  }
  try {
    const snap = (await readSnapshot());
    let stats: Record<string, ModelStat> = {};
    for (const t of await readAllTurns()) stats = tallyTurn(stats, t);
    await r.set(STATE_KEY, { ...snap, modelStats: stats });
    return stats;
  } finally {
    await releaseTurnLock().catch(() => {});
  }
}

export async function readConfig(): Promise<GameConfig> {
  if (useRedis) {
    const r = await redis();
    const cfg = await r.get<Partial<GameConfig>>(CONFIG_KEY);
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
  if (useRedis) {
    const r = await redis();
    await r.set(CONFIG_KEY, next);
  } else {
    ensureDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), "utf8");
  }
  return next;
}

// Cross-instance turn lock. TTL guards against a crashed holder; the
// local backend needs none because dev runs a single process.
export async function acquireTurnLock(): Promise<boolean> {
  if (!useRedis) return true;
  const r = await redis();
  return (await r.set(LOCK_KEY, "1", { nx: true, px: 55_000 })) !== null;
}

export async function releaseTurnLock(): Promise<void> {
  if (!useRedis) return;
  const r = await redis();
  await r.del(LOCK_KEY);
}
