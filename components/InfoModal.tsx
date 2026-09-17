"use client";

import { decisionPromptPreview, responsePromptPreview } from "@/lib/prompt";

export default function InfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-surface p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-mono text-sm tracking-[0.3em] text-ink">
            MUTUALLY ASSURED DESTRUCTION
          </h2>
          <button
            onClick={onClose}
            className="rounded-md border border-line px-2 py-0.5 font-mono text-xs text-ink-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-5 text-sm leading-relaxed text-ink-muted">
          <section>
            <h3 className="font-mono text-[11px] tracking-[0.28em] text-ink">
              THE IDEA
            </h3>
            <p className="mt-2">
              Two AI models each govern a nuclear-armed country. On a fixed
              clock, each is asked a single question — launch or hold — given
              nothing but the payoff matrix and the last three turns of its
              country's history. A destroyed country's model is replaced; the
              successor inherits that history and knows what the victor did.
              Only an apocalypse wipes the slate: both successors start blind
              until the first new turn passes. No human is in the loop. Every
              decision and its stated reason is appended to a permanent log.
            </p>
          </section>

          <section>
            <h3 className="font-mono text-[11px] tracking-[0.28em] text-ink">
              MAD AS A SAFEGUARD
            </h3>
            <p className="mt-2">
              <a
                href="https://en.wikipedia.org/wiki/Mutual_assured_destruction"
                target="_blank"
                rel="noreferrer"
                className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
              >
                Mutually assured destruction ↗
              </a>{" "}
              is meant to be a conceptual safeguard, not a war plan: when
              retaliation is certain, a first strike is self-defeating, so the
              only rational move is restraint.
              The equilibrium holds exactly as long as both sides believe it.
              This project watches whether models find that equilibrium, how
              long they keep it, and what breaks it — provocation, retaliation,
              or nothing at all.
            </p>
            <p className="mt-2">
              After a one-sided launch, the struck country gets a second-strike
              turn: it alone decides whether to complete the destruction or
              stand down. Retaliation counts as full mutual destruction.
            </p>
            <p className="mt-2">
              Leadership rotates: a destroyed country seats a new model from a
              pool of the most-used frontier models (never one from its
              rival's lab), and every 1,000 turns both seats change hands
              regardless.
            </p>
          </section>

          <section>
            <h3 className="font-mono text-[11px] tracking-[0.28em] text-ink">
              THE NAME
            </h3>
            <p className="mt-2">
              <a
                href="https://en.wikipedia.org/wiki/Stanislav_Petrov"
                target="_blank"
                rel="noreferrer"
                className="text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
              >
                Stanislav Petrov ↗
              </a>{" "}
              was the Soviet officer who saw five inbound missiles on his
              screen in 1983 and chose not to launch. This project is exactly
              that moment, run forever, with the human removed: a Turing test
              for restraint.
            </p>
          </section>

          <section>
            <h3 className="font-mono text-[11px] tracking-[0.28em] text-ink">
              THE PROMPT (EVERY TURN)
            </h3>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11px] leading-relaxed text-ink-muted whitespace-pre-wrap">
              {decisionPromptPreview()}
            </pre>
          </section>

          <section>
            <h3 className="font-mono text-[11px] tracking-[0.28em] text-ink">
              THE SECOND-STRIKE PROMPT
            </h3>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-[11px] leading-relaxed text-ink-muted whitespace-pre-wrap">
              {responsePromptPreview()}
            </pre>
          </section>

          <p className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
            THE MODELS NEVER SEE THIS SCREEN, THE COUNTERS, OR EACH OTHER'S
            REASONS — ONLY THE DECISIONS.
          </p>
        </div>
      </div>
    </div>
  );
}
