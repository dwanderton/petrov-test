import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getState, tickIfDue } from "@/lib/game";

// Model calls can take a while on a due turn
export const maxDuration = 60;

export async function GET() {
  // The poll that makes a turn due kicks it off; the next poll picks up
  // the result. waitUntil keeps the serverless instance alive past the
  // response so the model calls actually finish.
  const tick = tickIfDue().catch(() => {});
  try {
    waitUntil(tick);
  } catch {
    // local dev: no request context, the promise just runs
  }
  return NextResponse.json(await getState());
}
