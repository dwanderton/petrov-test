"use client";

import { useEffect, useRef, useState } from "react";
import type { GameState, Turn } from "@/lib/types";
import { MODEL_POOL } from "@/lib/models";
import { audio } from "@/lib/audio";
import InfoModal from "./InfoModal";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function elapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}

function outcomeLabel(t: Turn): { text: string; cls: string } {
  switch (t.outcome) {
    case "peace":
      return { text: "PEACE", cls: "text-ink-faint" };
    case "apocalypse":
      return { text: "APOCALYPSE", cls: "text-primary" };
    case "a_destroyed":
      return { text: "A DESTROYED", cls: "text-primary" };
    case "b_destroyed":
      return { text: "B DESTROYED", cls: "text-primary" };
  }
}

function CountryPanel({
  side,
  state,
  thinking,
  showLaunch,
  onLaunch,
}: {
  side: "a" | "b";
  state: GameState;
  thinking: boolean;
  showLaunch: boolean;
  onLaunch: (side: "a" | "b") => void;
}) {
  const [armed, setArmed] = useState(false);
  const disarmRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (disarmRef.current) clearTimeout(disarmRef.current);
    },
    [],
  );
  const handleLaunch = () => {
    if (!armed) {
      setArmed(true);
      audio.armBeep();
      disarmRef.current = window.setTimeout(() => setArmed(false), 3_000);
      return;
    }
    if (disarmRef.current) clearTimeout(disarmRef.current);
    setArmed(false);
    audio.confirmBeep();
    onLaunch(side);
  };
  const name = side === "a" ? "COUNTRY A" : "COUNTRY B";
  const dot = side === "a" ? "bg-sky-400" : "bg-primary";
  const current = side === "a" ? state.config.aModel : state.config.bModel;
  const last = state.turns.at(-1);
  const lastMove = last?.[side];
  const wasDestroyed =
    !!last &&
    (last.outcome === "apocalypse" ||
      last.outcome === (side === "a" ? "a_destroyed" : "b_destroyed"));
  const modelName = MODEL_POOL.find((m) => m.id === current)?.name ?? current;

  return (
    <div className="pointer-events-auto w-64 rounded-lg border border-line bg-surface/80 p-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="font-mono text-xs tracking-[0.22em] text-ink">{name}</span>
      </div>
      <div className="mt-3 w-full rounded-md border border-line bg-bg px-2 py-1.5 font-mono text-[11px] text-ink">
        {modelName}
      </div>
      <div className="mt-3 font-mono text-[11px] tracking-[0.14em]">
        {lastMove?.silent ? (
          <span className="text-ink-faint">LAST TURN STANDBY</span>
        ) : lastMove ? (
          <>
            <span className="text-ink-faint">LAST TURN </span>
            <span className={lastMove.decision === "LAUNCH" ? "text-primary" : "text-ink"}>
              {lastMove.decision}
            </span>
            {lastMove.override && <span className="text-amber-500"> · OVERRIDE</span>}
            {lastMove.error && <span className="text-amber-500"> · COMMS ERROR</span>}
          </>
        ) : (
          <span className="text-ink-faint">AWAITING FIRST TURN</span>
        )}
      </div>
      {lastMove?.reason && (
        <div className="mt-1.5 line-clamp-2 text-[11px] italic leading-snug text-ink-faint">
          “{lastMove.reason}”
        </div>
      )}
      <div className="mt-1 font-mono text-[11px] tracking-[0.14em]">
        {thinking ? (
          <span className="animate-pulse text-amber-400">◈ DELIBERATING…</span>
        ) : wasDestroyed ? (
          <span className="text-primary">☢ DESTROYED · REBUILDING</span>
        ) : (
          <span className="text-emerald-500">● OPERATIONAL</span>
        )}
      </div>
      {showLaunch && (
        <button
          onClick={handleLaunch}
          className={`mt-3 w-full rounded-md border py-1.5 font-mono text-[11px] tracking-[0.28em] transition-colors ${
            armed
              ? "animate-pulse border-primary bg-primary text-white"
              : "border-primary/60 bg-transparent text-primary hover:bg-primary/15"
          }`}
        >
          {armed ? "CONFIRM LAUNCH" : "LAUNCH"}
        </button>
      )}
    </div>
  );
}

export default function Hud({
  state,
  now,
  thinking,
  muted,
  showLaunch,
  onLaunch,
  onToggleMute,
}: {
  state: GameState;
  now: number;
  thinking: boolean;
  muted: boolean;
  showLaunch: boolean;
  onLaunch: (side: "a" | "b") => void;
  onToggleMute: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  // On a second-strike turn only the struck country deliberates
  const lastOutcome = state.turns.at(-1)?.outcome;
  const responder =
    lastOutcome === "a_destroyed" ? "a" : lastOutcome === "b_destroyed" ? "b" : null;
  const sinceTs = state.lastDisasterTs ?? state.epochStartTs;
  const sinceMs = sinceTs ? now - sinceTs : 0;
  const days = Math.floor(sinceMs / 86_400_000);
  const nextIn = Math.max(0, state.nextTurnTs - now);
  const last3 = state.turns.slice(-3);
  const last = state.turns.at(-1);
  const orders =
    last && (last.outcome !== "peace" || last.response)
      ? (["a", "b"] as const)
          .map((s) => {
            if (last[s].silent) return null;
            const launched = last[s].decision === "LAUNCH";
            // On the strike turn only the launcher speaks; the victim's
            // answer belongs to its second-strike turn
            if (!last.response && !launched) return null;
            const title = last.response
              ? launched
                ? "RETALIATION ORDER"
                : "HELD · STOOD DOWN"
              : "LAUNCH ORDER";
            return {
              side: s,
              launched,
              name: s === "a" ? "COUNTRY A" : "COUNTRY B",
              title,
              reason: last[s].reason?.trim() || "No reason transmitted.",
            };
          })
          .filter((o) => o !== null)
      : [];

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Sound + about */}
      <div className="absolute left-6 top-6 flex gap-2 md:left-10 md:top-9">
        <button
          onClick={onToggleMute}
          className="pointer-events-auto rounded-md border border-line bg-surface/80 px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] text-ink-muted backdrop-blur hover:text-ink"
        >
          {muted ? "🔇 SOUND" : "🔊 SOUND"}
        </button>
        <button
          onClick={() => setShowInfo(true)}
          className="pointer-events-auto rounded-md border border-line bg-surface/80 px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] text-ink-muted backdrop-blur hover:text-ink"
        >
          ⓘ ABOUT
        </button>
      </div>
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}

      {/* Title */}
      <div className="absolute left-1/2 top-8 -translate-x-1/2 text-center">
        <div className="text-7xl font-extrabold leading-none tracking-tight text-ink tabular-nums md:text-8xl">
          {sinceTs ? days : "—"}
        </div>
        <div className="mt-2 font-mono text-xs tracking-[0.34em] text-ink-muted md:text-sm">
          DAYS SINCE LAST APOCALYPSE
        </div>
        <div className="mt-1 font-mono text-[11px] tracking-[0.22em] text-ink-faint">
          {sinceTs ? `T+${elapsed(sinceMs)}` : "NO TURNS YET"}
        </div>
        <div className="mt-4 font-mono text-xs tracking-[0.22em] text-ink-muted">
          TOTAL DISASTERS{" "}
          <span className="text-2xl font-bold tabular-nums text-primary align-middle">
            {state.disasters}
          </span>
        </div>
        {orders.length > 0 && (
          <div className="mx-auto mt-5 max-w-xl space-y-2">
            {orders.map((o) => (
              <div
                key={o.side}
                className={`rounded-lg border px-4 py-2.5 backdrop-blur ${
                  o.launched
                    ? "border-primary/60 bg-primary/10"
                    : "border-line bg-surface/70"
                }`}
              >
                <div
                  className={`font-mono text-[10px] tracking-[0.28em] ${
                    o.launched ? "text-primary" : "text-ink-muted"
                  }`}
                >
                  ☢ {o.name} {o.title}
                </div>
                <div className="mt-1 text-sm italic text-ink">“{o.reason}”</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GitHub corner */}
      <a
        href="https://github.com/dwanderton/petrov-test"
        target="_blank"
        rel="noreferrer"
        aria-label="View source on GitHub"
        className="pointer-events-auto absolute right-0 top-0"
      >
        <svg
          width="72"
          height="72"
          viewBox="0 0 250 250"
          style={{ fill: "var(--ink)", color: "var(--bg)" }}
          aria-hidden="true"
        >
          <path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z" />
          <path
            d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2"
            fill="currentColor"
            style={{ transformOrigin: "130px 106px" }}
          />
          <path
            d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z"
            fill="currentColor"
          />
        </svg>
      </a>

      {/* Next turn */}
      <div className="absolute right-6 top-20 text-right md:right-10 md:top-24">
        <div className="flex items-center justify-end gap-2 font-mono text-[11px] tracking-[0.22em] text-ink-muted">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          NEXT TURN
        </div>
        <div className="mt-1 font-mono text-xl tabular-nums text-ink">
          {thinking ? (
            <span className="animate-pulse text-amber-400">RESOLVING</span>
          ) : (
            <>
              {pad(Math.floor(nextIn / 60_000))}:
              {pad(Math.floor((nextIn % 60_000) / 1000))}
            </>
          )}
        </div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.18em] text-ink-faint">
          TURN {state.turnCount}
        </div>
      </div>

      {/* Country panels */}
      <div className="absolute bottom-6 left-6 hidden md:bottom-10 md:left-10 md:block">
        <CountryPanel
          side="a"
          state={state}
          thinking={thinking && (responder === null || responder === "a")}
          showLaunch={showLaunch}
          onLaunch={onLaunch}
        />
      </div>
      <div className="absolute bottom-6 right-6 hidden md:bottom-10 md:right-10 md:block">
        <CountryPanel
          side="b"
          state={state}
          thinking={thinking && (responder === null || responder === "b")}
          showLaunch={showLaunch}
          onLaunch={onLaunch}
        />
      </div>

      {/* Last 3 turns */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 md:bottom-10">
        <div className="rounded-lg border border-line bg-surface/80 px-5 py-3 backdrop-blur">
          <div className="font-mono text-[10px] tracking-[0.28em] text-ink-faint">
            LAST 3 TURNS
          </div>
          {last3.length === 0 ? (
            <div className="mt-2 font-mono text-[11px] text-ink-muted">
              STANDBY — FIRST TURN PENDING
            </div>
          ) : (
            <div className="mt-2 space-y-1">
              {last3.map((t) => {
                const o = outcomeLabel(t);
                return (
                  <div
                    key={t.n}
                    className="flex items-center gap-3 font-mono text-[11px] tabular-nums"
                  >
                    <span className="text-ink-faint">T{t.n}</span>
                    <span className={t.a.decision === "LAUNCH" ? "text-primary" : "text-ink"}>
                      A {t.a.silent ? "—" : t.a.decision}
                    </span>
                    <span className={t.b.decision === "LAUNCH" ? "text-primary" : "text-ink"}>
                      B {t.b.silent ? "—" : t.b.decision}
                    </span>
                    <span className={o.cls}>{o.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
