import { NextResponse } from "next/server";
import { getState, tickIfDue } from "@/lib/game";

export async function GET() {
  // Fire-and-forget: the poll that makes a turn due kicks it off, the next
  // poll (4s later) picks up the result. Keeps state responses instant.
  void tickIfDue().catch(() => {});
  return NextResponse.json(getState());
}
