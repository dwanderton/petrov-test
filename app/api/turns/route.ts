import { readAllTurns } from "@/lib/store";

// Stitching many archive chunks can take a moment on long games
export const maxDuration = 60;

export async function GET() {
  const turns = await readAllTurns();
  const jsonl = turns.map((t) => JSON.stringify(t)).join("\n") + "\n";
  return new Response(jsonl, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": 'attachment; filename="petrov-turns.jsonl"',
      "Cache-Control": "no-store",
    },
  });
}
