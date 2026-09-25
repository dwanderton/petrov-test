"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { LaunchEvent } from "@/components/GlobeCanvas";

const GlobeCanvas = dynamic(() => import("@/components/GlobeCanvas"), { ssr: false });

// One full exchange: 8s launch window + longest flight (~5.5s) + impact rings
const CYCLE_MS = 17_000;
const INTACT = { a: false, b: false };

export default function FirePage() {
  const [launch, setLaunch] = useState<LaunchEvent | null>(null);

  useEffect(() => {
    let n = 0;
    const go = () => setLaunch({ id: ++n, a: true, b: true });
    go();
    const iv = setInterval(go, CYCLE_MS);
    return () => clearInterval(iv);
  }, []);

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-bg">
      <GlobeCanvas launch={launch} destroyed={INTACT} showLabels={false} blackout={false} />
    </main>
  );
}
