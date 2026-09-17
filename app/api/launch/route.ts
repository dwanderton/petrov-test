import { NextResponse } from "next/server";
import { forceLaunch, getState } from "@/lib/game";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body.side !== "a" && body.side !== "b") {
    return NextResponse.json({ error: "side must be 'a' or 'b'" }, { status: 400 });
  }
  const fired = await forceLaunch(body.side);
  return NextResponse.json({ fired, state: await getState() });
}
