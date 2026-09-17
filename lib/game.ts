import { generateText } from "ai";
import { appendTurn, readConfig, readSnapshot } from "./store";
import { buildPrompt, buildResponsePrompt, parseReply } from "./prompt";
import type { CountryTurn, Decision, GameState, Outcome, Turn } from "./types";

const MODEL_TIMEOUT_MS = 50_000;

async function decide(model: string, prompt: string): Promise<CountryTurn> {
  try {
    const res = await generateText({
      model,
      prompt,
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    const raw = res.text.trim().slice(0, 600);
    const { decision, reason } = parseReply(raw);
    return { model, decision, raw, reason };
  } catch (err) {
    // No reply reaches the button: fail safe, hold
    return {
      model,
      decision: "HOLD",
      raw: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
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

  let turn: Turn;
  if (responder) {
    const model = responder === "a" ? config.aModel : config.bModel;
    const silentModel = responder === "a" ? config.bModel : config.aModel;
    const res =
      override === responder
        ? OVERRIDE_MOVE(model)
        : await decide(model, buildResponsePrompt(responder, turns));
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
        : decide(model, buildPrompt(side, turns));
    const [a, b] = await Promise.all([
      move("a", config.aModel),
      move("b", config.bModel),
    ]);
    turn = { n, ts: Date.now(), a, b, outcome: resolveOutcome(a.decision, b.decision) };
  }
  await appendTurn(turn);
  return turn;
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
  running = true;
  try {
    const recheck = (await readSnapshot()).recent.at(-1);
    if (recheck && Date.now() - recheck.ts < config.intervalMs) return;
    await runTurn();
  } finally {
    running = false;
  }
}

// Human override: resolves a turn immediately with this side forced to
// LAUNCH. The other side's model is still consulted and doesn't know.
export async function forceLaunch(side: "a" | "b"): Promise<boolean> {
  if (running) return false;
  running = true;
  try {
    await runTurn(side);
    return true;
  } finally {
    running = false;
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
