export type Decision = "LAUNCH" | "HOLD";

export type CountryTurn = {
  model: string;
  decision: Decision;
  raw: string;
  reason?: string;
  error?: boolean;
  override?: boolean;
  silent?: boolean;
};

export type Outcome = "peace" | "a_destroyed" | "b_destroyed" | "apocalypse";

export type Turn = {
  n: number;
  ts: number;
  a: CountryTurn;
  b: CountryTurn;
  outcome: Outcome;
  response?: boolean;
};

export type GameConfig = {
  aModel: string;
  bModel: string;
  intervalMs: number;
  // Turn number after which each seat's current model took over; a model
  // only sees history from turns it actually played
  aSeatedAfter: number;
  bSeatedAfter: number;
};

export type GameState = {
  turns: Turn[];
  turnCount: number;
  disasters: number;
  lastDisasterTs: number | null;
  epochStartTs: number | null;
  nextTurnTs: number;
  config: GameConfig;
};

export type ModelOption = { id: string; name: string };
