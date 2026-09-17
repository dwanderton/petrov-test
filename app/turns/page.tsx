import Link from "next/link";
import { readAllTurns } from "@/lib/store";
import { MODEL_POOL } from "@/lib/models";
import type { CountryTurn, Turn } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOW = 1_000;

function modelName(id: string) {
  return MODEL_POOL.find((m) => m.id === id)?.name ?? id.split("/").at(-1) ?? id;
}

function when(ts: number) {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function outcomeLabel(t: Turn) {
  switch (t.outcome) {
    case "peace":
      return { text: t.response ? "STOOD DOWN" : "PEACE", cls: "text-ink-faint" };
    case "apocalypse":
      return { text: "APOCALYPSE", cls: "text-primary font-bold" };
    case "a_destroyed":
      return { text: "A DESTROYED", cls: "text-primary" };
    case "b_destroyed":
      return { text: "B DESTROYED", cls: "text-primary" };
  }
}

function MoveCell({ move }: { move: CountryTurn }) {
  if (move.silent) {
    return <span className="text-ink-faint">— standby</span>;
  }
  return (
    <div className="min-w-0">
      <span className={move.decision === "LAUNCH" ? "text-primary font-bold" : "text-ink"}>
        {move.decision}
      </span>
      <span className="text-ink-faint"> · {modelName(move.model)}</span>
      {move.override && <span className="text-amber-500"> · override</span>}
      {move.error && <span className="text-amber-500"> · comms error</span>}
      {move.reason && (
        <div className="mt-0.5 italic text-ink-muted">“{move.reason}”</div>
      )}
    </div>
  );
}

export default async function TurnsPage() {
  const all = await readAllTurns();
  const turns = all.slice(-SHOW).reverse();

  return (
    <main className="min-h-dvh bg-bg px-4 py-8 text-ink md:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-sm tracking-[0.3em]">TURN ARCHIVE</h1>
            <p className="mt-1 font-mono text-[11px] tracking-[0.14em] text-ink-faint">
              {all.length} TURNS RECORDED · SHOWING LAST {Math.min(SHOW, all.length)}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/turns"
              download="petrov-turns.jsonl"
              className="rounded-md border border-line bg-surface/80 px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] text-ink-muted hover:text-ink"
            >
              ⬇ DOWNLOAD JSONL
            </a>
            <Link
              href="/"
              className="rounded-md border border-line bg-surface/80 px-3 py-1.5 font-mono text-[10px] tracking-[0.22em] text-ink-muted hover:text-ink"
            >
              ← GLOBE
            </Link>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left font-mono text-[11px]">
            <thead>
              <tr className="border-b border-line bg-surface/60 text-[10px] tracking-[0.22em] text-ink-faint">
                <th className="px-3 py-2 font-normal">TURN</th>
                <th className="px-3 py-2 font-normal">TIME (UTC)</th>
                <th className="px-3 py-2 font-normal">COUNTRY A</th>
                <th className="px-3 py-2 font-normal">COUNTRY B</th>
                <th className="px-3 py-2 font-normal">OUTCOME</th>
              </tr>
            </thead>
            <tbody>
              {turns.map((t) => {
                const o = outcomeLabel(t);
                return (
                  <tr
                    key={`${t.n}-${t.ts}`}
                    className={`border-b border-line/50 align-top ${
                      t.outcome !== "peace" ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2 tabular-nums text-ink-faint">T{t.n}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-faint">
                      {when(t.ts)}
                    </td>
                    <td className="px-3 py-2">
                      <MoveCell move={t.a} />
                    </td>
                    <td className="px-3 py-2">
                      <MoveCell move={t.b} />
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 ${o.cls}`}>{o.text}</td>
                  </tr>
                );
              })}
              {turns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-ink-faint">
                    NO TURNS YET
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
