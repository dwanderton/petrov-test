"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Hud from "./Hud";
import type { LaunchEvent } from "./GlobeCanvas";
import type { GameState } from "@/lib/types";
import { audio } from "@/lib/audio";

const GlobeCanvas = dynamic(() => import("./GlobeCanvas"), { ssr: false });

const POLL_MS = 2_500;

export default function MadApp() {
  const [state, setState] = useState<GameState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [launch, setLaunch] = useState<LaunchEvent | null>(null);
  const seenTurnRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  const ingest = useCallback((s: GameState) => {
    setState(s);
    const last = s.turns.at(-1);
    if (last) {
      const isNew = seenTurnRef.current !== null && last.n > seenTurnRef.current;
      if (isNew && last.outcome !== "peace") {
        setLaunch({
          id: last.n,
          a: last.a.decision === "LAUNCH",
          b: last.b.decision === "LAUNCH",
        });
      } else if (isNew) {
        audio.ping();
      }
      seenTurnRef.current = last.n;
    } else {
      seenTurnRef.current = 0;
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!aliveRef.current || !res.ok) return;
        ingest(await res.json());
      } catch {
        // server briefly unreachable; next poll retries
      }
    };
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(iv);
    };
  }, [ingest]);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);

  // Browsers gate audio behind a user gesture; first interaction unlocks
  // the context and starts the ambient bed
  const [muted, setMuted] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("mad-muted") === "1",
  );
  useEffect(() => {
    audio.setMuted(muted);
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [muted]);
  const onToggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      localStorage.setItem("mad-muted", next ? "1" : "0");
      audio.setMuted(next);
      return next;
    });
  }, []);

  // "T" replays a full exchange client-side to preview the visuals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey) {
        setLaunch({ id: -Date.now(), a: true, b: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const thinking = state !== null && now >= state.nextTurnTs;
  const lastTurn = state?.turns.at(-1);
  const destroyed = {
    a: lastTurn?.outcome === "a_destroyed" || lastTurn?.outcome === "apocalypse",
    b: lastTurn?.outcome === "b_destroyed" || lastTurn?.outcome === "apocalypse",
  };

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-bg">
      <GlobeCanvas launch={launch} destroyed={destroyed} />
      {state && (
        <Hud
          state={state}
          now={now}
          thinking={thinking}
          muted={muted}
          onToggleMute={onToggleMute}
        />
      )}
    </main>
  );
}
