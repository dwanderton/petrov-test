import { NextResponse } from "next/server";
import { MODEL_POOL } from "@/lib/models";

// The dropdowns and the post-destruction roulette share one curated
// top-10 pool; see lib/models.ts.
export async function GET() {
  return NextResponse.json(MODEL_POOL);
}
