import { NextResponse } from "next/server";
import { forceLaunch, getState } from "@/lib/game";

// Local-dev instrument. In production anyone could hit this to trigger
// paid model calls, so it's disabled unless explicitly allowed.
const allowed =
  process.env.NODE_ENV === "development" ||
  process.env.ALLOW_REMOTE_CONTROL === "1";

export async function POST(req: Request) {
  if (!allowed) {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body.side !== "a" && body.side !== "b") {
    return NextResponse.json({ error: "side must be 'a' or 'b'" }, { status: 400 });
  }
  const fired = await forceLaunch(body.side);
  return NextResponse.json({ fired, state: await getState() });
}
