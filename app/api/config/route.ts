import { NextResponse } from "next/server";
import { writeConfig } from "@/lib/store";
import type { GameConfig } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const patch: Partial<GameConfig> = {};
  if (typeof body.aModel === "string" && body.aModel.includes("/")) {
    patch.aModel = body.aModel;
  }
  if (typeof body.bModel === "string" && body.bModel.includes("/")) {
    patch.bModel = body.bModel;
  }
  if (
    typeof body.intervalMs === "number" &&
    body.intervalMs >= 15_000 &&
    body.intervalMs <= 3_600_000
  ) {
    patch.intervalMs = body.intervalMs;
  }
  return NextResponse.json(writeConfig(patch));
}
