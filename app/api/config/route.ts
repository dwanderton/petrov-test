import { NextResponse } from "next/server";
import { writeConfig } from "@/lib/store";
import type { GameConfig } from "@/lib/types";

// Models are assigned by the post-destruction roulette, not the UI;
// this endpoint only tunes the clock, and only outside production.
const allowed =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_REMOTE_CONTROL === "1";

export async function POST(req: Request) {
  if (!allowed) {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: Partial<GameConfig> = {};
  if (
    typeof body.intervalMs === "number" &&
    body.intervalMs >= 15_000 &&
    body.intervalMs <= 3_600_000
  ) {
    patch.intervalMs = body.intervalMs;
  }
  return NextResponse.json(await writeConfig(patch));
}
