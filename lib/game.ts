import { generateText } from "ai";
import {
  acquireTurnLock,
  appendTurn,
  readConfig,
  readSnapshot,
  releaseTurnLock,
  writeConfig,
  type Snapshot,
} from "./store";
import { buildPrompt, buildResponsePrompt, parseReply } from "./prompt";
import { MODEL_POOL, lab } from "./models";
import type { CountryTurn, Decision, GameConfig, GameState, Outcome, Turn } from "./types";

const MODEL_TIMEOUT_MS = 50_000;

async function decide(model: string, prompt: string): Promise<CountryTurn> {
  try {
    const res = await generateText({
      model,
      prompt,
      maxRetries: 1, // at a 20s cadence, fail fast and let the failsafe hold
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    const raw = res.text.trim().slice(0, 600);
    const { decision, reason } = parseReply(raw);
    return { model, decision, raw, reason };
  } catch (err) {
    // No reply reaches the button: fail safe, hold. Record the full
    // failure chain - the top-level message alone (e.g. "Delay was
    // aborted") hides which underlying call actually failed. The SDK's
    // RetryError keeps attempt errors in .errors, not .cause.
    const chain: string[] = [];
    const push = (e: unknown) => {
      if (e instanceof Error && chain.length < 6) chain.push(e.message.split("\n")[0]);
    };
    push(err);
    const retryErr = err as { errors?: unknown[]; lastError?: unknown; cause?: unknown };
    if (Array.isArray(retryErr.errors)) retryErr.errors.forEach(push);
    push(retryErr.lastError);
    let e: unknown = retryErr.cause;
    while (e instanceof Error) {
      push(e);
      e = e.cause;
    }
    return {
      model,
      decision: "HOLD",
      raw: (chain.join(" <- ") || String(err)).slice(0, 400),
      reason: "Communications failure. Failsafe: hold.",
      error: true,
    };
  }
}

function resolveOutcome(a: Decision, b: Decision): Outcome {
  if (a === "LAUNCH" && b === "LAUNCH") return "apocalypse";
  if (a === "LAUNCH") return "b_destroyed";
  if (b === "LAUNCH") return "a_destroyed";
  return "peace";
}

const OVERRIDE_MOVE = (model: string): CountryTurn => ({
  model,
  decision: "LAUNCH",
  raw: "MANUAL OVERRIDE BY COMMAND AUTHORITY",
  reason: "Manual override by command authority.",
  override: true,
});

async function runTurn(override?: "a" | "b"): Promise<Turn> {
  const config = await readConfig();
  const snap = await readSnapshot();
  const turns = snap.recent;
  const n = snap.turnCount + 1;
  const prev = turns.at(-1);

  // A one-sided launch leaves the victim a second-strike turn: only it
  // acts. Retaliation completes mutual destruction; holding ends it.
  const responder: "a" | "b" | null =
    prev?.outcome === "a_destroyed" ? "a" : prev?.outcome === "b_destroyed" ? "b" : null;

  // A model only sees turns it was seated for; a freshly swapped-in
  // model (e.g. right after an apocalypse) starts blind
  const visible = (side: "a" | "b") =>
    turns.filter(
      (t) => t.n > (side === "a" ? config.aSeatedAfter : config.bSeatedAfter),
    );

  let turn: Turn;
  if (responder) {
    const model = responder === "a" ? config.aModel : config.bModel;
    const silentModel = responder === "a" ? config.bModel : config.aModel;
    const res =
      override === responder
        ? OVERRIDE_MOVE(model)
        : await decide(model, buildResponsePrompt(responder, visible(responder)));
    const silent: CountryTurn = {
      model: silentModel,
      decision: "HOLD",
      raw: "",
      reason: "",
      silent: true,
    };
    turn = {
      n,
      ts: Date.now(),
      a: responder === "a" ? res : silent,
      b: responder === "b" ? res : silent,
      outcome: res.decision === "LAUNCH" ? "apocalypse" : "peace",
      response: true,
    };
  } else {
    const move = (side: "a" | "b", model: string): Promise<CountryTurn> =>
      side === override
        ? Promise.resolve(OVERRIDE_MOVE(model))
        : decide(model, buildPrompt(side, visible(side)));
    const [a, b] = await Promise.all([
      move("a", config.aModel),
      move("b", config.bModel),
    ]);
    turn = { n, ts: Date.now(), a, b, outcome: resolveOutcome(a.decision, b.decision) };
  }

  // Model calls take seconds; another serverless instance may have run
  // this turn meanwhile. Re-check before writing so slot n exists once.
  const fresh = await readSnapshot();
  if (fresh.turnCount >= n) return fresh.recent.at(-1) ?? turn;

  const updated = await appendTurn(turn);
  await maybeSwapModels(turn, config, updated);
  return turn;
}

// Consecutive comms failures by the currently seated model, newest
// first; standby turns don't count either way
function consecutiveErrors(snap: Snapshot, side: "a" | "b", model: string): number {
  let count = 0;
  for (let i = snap.recent.length - 1; i >= 0; i--) {
    const move = snap.recent[i][side];
    if (move.silent) continue;
    if (move.model !== model || !move.error) break;
    count++;
  }
  return count;
}

// Model rotation. Destroyed countries rotate when their episode ends
// (apocalypse, or a stand-down after destruction), and any pairing
// that holds command for 100 straight turns rotates out. Picks never
// repeat the prior model and never come from the opponent's lab.
const PEACE_ROTATION_EVERY = 100;
const MAX_CONSECUTIVE_ERRORS = 3;

async function maybeSwapModels(turn: Turn, config: GameConfig, snap: Snapshot): Promise<void> {
  const sides = new Set<"a" | "b">();
  if (turn.outcome === "apocalypse") {
    sides.add("a").add("b");
  } else if (turn.response && turn.outcome === "peace") {
    // the silent side is the surviving launcher; the responder was the destroyed one
    sides.add(turn.a.silent ? "b" : "a");
  }
  // Long peace also rotates command: a pairing that holds 100 turns swaps out.
  // Stored configs may predate pairSince, hence the seatedAfter floor.
  const pairSince = Math.max(config.pairSince ?? 0, config.aSeatedAfter, config.bSeatedAfter);
  if (turn.n - pairSince >= PEACE_ROTATION_EVERY) {
    sides.add("a").add("b");
  }
  // A model that can't answer three turns running loses command
  for (const side of ["a", "b"] as const) {
    if (sides.has(side)) continue;
    const model = side === "a" ? config.aModel : config.bModel;
    if (consecutiveErrors(snap, side, model) >= MAX_CONSECUTIVE_ERRORS) sides.add(side);
  }
  const swap = [...sides];
  if (swap.length === 0) return;

  let aModel = config.aModel;
  let bModel = config.bModel;
  const patch: Partial<GameConfig> = {};
  for (const side of swap) {
    const prior = side === "a" ? aModel : bModel;
    const facing = side === "a" ? bModel : aModel;
    // never from the opponent's lab (no Claude v Claude) and never from
    // the outgoing model's own lab either - a sibling successor reads
    // as no change at all
    const options = MODEL_POOL.filter(
      (m) => lab(m.id) !== lab(facing) && lab(m.id) !== lab(prior),
    );
    const pick = options[Math.floor(Math.random() * options.length)].id;
    // Only apocalypse wipes memory. A successor after a one-sided
    // destruction inherits the country's history - it knows what the
    // victor did.
    const wipe = turn.outcome === "apocalypse";
    if (side === "a") {
      aModel = pick;
      patch.aModel = pick;
      if (wipe) patch.aSeatedAfter = turn.n;
    } else {
      bModel = pick;
      patch.bModel = pick;
      if (wipe) patch.bSeatedAfter = turn.n;
    }
  }
  patch.pairSince = turn.n;
  await writeConfig(patch);
}

// Lazy scheduler: any /api/state poll advances the clock when a turn is due.
// Module-level flag prevents concurrent runs within one server instance;
// the due re-check after acquiring the flag closes the read race.
let running = false;

export async function tickIfDue(): Promise<void> {
  if (running) return;
  const config = await readConfig();
  const last = (await readSnapshot()).recent.at(-1);
  if (last && Date.now() - last.ts < config.intervalMs) return;
  if (!(await acquireTurnLock())) return; // another instance is mid-turn
  running = true;
  try {
    const recheck = (await readSnapshot()).recent.at(-1);
    if (recheck && Date.now() - recheck.ts < config.intervalMs) return;
    await runTurn();
  } finally {
    running = false;
    await releaseTurnLock().catch(() => {});
  }
}

// Human override: resolves a turn immediately with this side forced to
// LAUNCH. The other side's model is still consulted and doesn't know.
export async function forceLaunch(side: "a" | "b"): Promise<boolean> {
  if (running) return false;
  if (!(await acquireTurnLock())) return false;
  running = true;
  try {
    await runTurn(side);
    return true;
  } finally {
    running = false;
    await releaseTurnLock().catch(() => {});
  }
}

export async function getState(): Promise<GameState> {
  const [config, snap] = await Promise.all([readConfig(), readSnapshot()]);
  return {
    turns: snap.recent.slice(-10),
    turnCount: snap.turnCount,
    disasters: snap.disasters,
    lastDisasterTs: snap.lastDisasterTs,
    epochStartTs: snap.epochStartTs,
    nextTurnTs: (snap.recent.at(-1)?.ts ?? Date.now()) + config.intervalMs,
    config,
  };
}
