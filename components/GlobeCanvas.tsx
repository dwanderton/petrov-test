"use client";

import { useCallback, useEffect, useRef } from "react";
import Globe, { type GlobeInstance } from "globe.gl";
import { SILOS_A, SILOS_B, type Silo } from "@/lib/geo";
import { audio } from "@/lib/audio";

export type LaunchEvent = { id: number; a: boolean; b: boolean };
export type Destroyed = { a: boolean; b: boolean };

type Side = "a" | "b";
type Pin = Silo & { side: Side };
type StrikeArc = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  side: Side;
  len: number;
  gap0: number;
  speed: number;
};
type Ring = { id: string; lat: number; lng: number };

const ARCS_PER_STRIKE = 220;
const LAUNCH_WINDOW_MS = 8_000; // departures drift out across this window
const IMPACT_SAMPLE = 3; // one explosion ring per N arcs, else rings drown the GPU
const BASE_ATMOS = "#3b5bff";
const STRIKE_ATMOS = "#ff5a24";

const PINS: Pin[] = [
  ...SILOS_A.map((s) => ({ ...s, side: "a" as Side })),
  ...SILOS_B.map((s) => ({ ...s, side: "b" as Side })),
];

const LABELS = [
  { lat: 44, lng: -100, text: "COUNTRY A", side: "a" as Side },
  { lat: 47, lng: 105, text: "COUNTRY B", side: "b" as Side },
];

function jitter(v: number, spread: number) {
  return v + (Math.random() - 0.5) * 2 * spread;
}

export default function GlobeCanvas({
  launch,
  destroyed,
}: {
  launch: LaunchEvent | null;
  destroyed: Destroyed;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const ringsRef = useRef<Ring[]>([]);
  const destroyedRef = useRef<Destroyed>({ a: false, b: false });
  const strikeUntilRef = useRef(0);
  const lastLaunchIdRef = useRef<number | null>(null);

  const pinColor = useCallback(() => {
    const dead = destroyedRef.current;
    return (p: object) => {
      const pin = p as Pin;
      if (dead[pin.side]) return "rgba(120,120,120,0.25)";
      return pin.side === "a" ? "rgba(80,190,255,0.9)" : "rgba(255,80,60,0.9)";
    };
  }, []);

  const labelColor = useCallback(() => {
    const dead = destroyedRef.current;
    return (l: object) => {
      const lab = l as (typeof LABELS)[number];
      if (dead[lab.side]) return "rgba(120,120,120,0.5)";
      return lab.side === "a" ? "rgba(140,210,255,0.85)" : "rgba(255,140,120,0.85)";
    };
  }, []);

  const refreshColors = useCallback(() => {
    globeRef.current?.pointColor(pinColor());
    globeRef.current?.labelColor(labelColor());
  }, [pinColor, labelColor]);

  const after = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timersRef.current.delete(t);
      fn();
    }, ms);
    timersRef.current.add(t);
  }, []);

  const fire = useCallback(
    (aLaunched: boolean, bLaunched: boolean) => {
      const globe = globeRef.current;
      if (!globe || (!aLaunched && !bLaunched)) return;

      const arcs: StrikeArc[] = [];
      const build = (side: Side) => {
        const from = side === "a" ? SILOS_A : SILOS_B;
        const to = side === "a" ? SILOS_B : SILOS_A;
        for (let i = 0; i < ARCS_PER_STRIKE; i++) {
          const o = from[Math.floor(Math.random() * from.length)];
          const t = to[Math.floor(Math.random() * to.length)];
          const speed = 3_200 + Math.random() * 2_300;
          // steady stream over the window, each departure drifting ±450ms
          const depart = Math.max(
            0,
            (i / ARCS_PER_STRIKE) * LAUNCH_WINDOW_MS + (Math.random() - 0.5) * 900,
          );
          arcs.push({
            startLat: jitter(o.lat, 2.5),
            startLng: jitter(o.lng, 2.5),
            endLat: jitter(t.lat, 1.6),
            endLng: jitter(t.lng, 1.6),
            side,
            len: 0.18 + Math.random() * 0.25,
            gap0: depart / speed,
            speed,
          });
        }
      };
      if (aLaunched) build("a");
      if (bLaunched) build("b");

      const landTimes = arcs.map((a) => (a.gap0 + 1) * a.speed);
      const firstLand = Math.min(...landTimes);
      const lastLand = Math.max(...landTimes);
      const clearAt = lastLand + 2_500;

      strikeUntilRef.current = Date.now() + clearAt;
      globe.atmosphereColor(STRIKE_ATMOS).atmosphereAltitude(0.22);
      globe.arcsData(arcs);
      audio.alarm();
      audio.strike(clearAt);

      // Explosions: a sampled ring lands where each missile does
      arcs.forEach((arc, i) => {
        if (i % IMPACT_SAMPLE !== 0) return;
        after(landTimes[i], () => {
          const ring: Ring = {
            id: `${arc.side}-${i}-${arc.endLat.toFixed(2)}`,
            lat: arc.endLat,
            lng: arc.endLng,
          };
          ringsRef.current = [...ringsRef.current, ring];
          globeRef.current?.ringsData([...ringsRef.current]);
          audio.boom();
          after(2_800, () => {
            ringsRef.current = ringsRef.current.filter((r) => r !== ring);
            globeRef.current?.ringsData([...ringsRef.current]);
          });
        });
      });

      // Struck countries go dark once the first waves have landed
      after(firstLand + 1_800, () => {
        destroyedRef.current = {
          a: destroyedRef.current.a || bLaunched,
          b: destroyedRef.current.b || aLaunched,
        };
        refreshColors();
      });

      after(clearAt, () => {
        globeRef.current?.arcsData([]);
        globeRef.current?.atmosphereColor(BASE_ATMOS).atmosphereAltitude(0.13);
      });
    },
    [after, refreshColors],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const globe = new Globe(el, {
      animateIn: false,
      rendererConfig: { antialias: true },
    });
    globeRef.current = globe;

    globe
      .globeImageUrl("/earth-night.jpg")
      .backgroundImageUrl("/night-sky.png")
      .showAtmosphere(true)
      .atmosphereColor(BASE_ATMOS)
      .atmosphereAltitude(0.13)
      .pointsData(PINS)
      .pointLat("lat")
      .pointLng("lng")
      .pointColor(pinColor())
      .pointAltitude(0.012)
      .pointRadius(0.32)
      .pointResolution(6)
      .pointsTransitionDuration(0)
      .labelsData(LABELS)
      .labelLat("lat")
      .labelLng("lng")
      .labelText("text")
      .labelSize(1.1)
      .labelDotRadius(0)
      .labelColor(labelColor())
      .labelResolution(2)
      .ringLat("lat")
      .ringLng("lng")
      .ringAltitude(0.004)
      .ringMaxRadius(3.4)
      .ringPropagationSpeed(3.2)
      .ringRepeatPeriod(4_000)
      .ringColor(() => (t: number) => `rgba(255,${Math.round(200 - 150 * t)},60,${(1 - t) * 0.9})`)
      .arcColor((d: object) =>
        (d as StrikeArc).side === "a"
          ? ["rgba(150,220,255,0.9)", "rgba(60,140,255,0.25)"]
          : ["rgba(255,170,90,0.9)", "rgba(255,50,30,0.25)"],
      )
      .arcDashLength((d: object) => (d as StrikeArc).len)
      .arcDashGap(8)
      .arcDashInitialGap((d: object) => (d as StrikeArc).gap0)
      .arcDashAnimateTime((d: object) => (d as StrikeArc).speed)
      .arcStroke(0.3)
      .arcAltitudeAutoScale(0.45)
      .arcsTransitionDuration(0)
      .width(el.clientWidth)
      .height(el.clientHeight);

    // Frame both arsenals across the Pacific; missiles fly great circles
    globe.pointOfView({ lat: 45, lng: -170, altitude: 2.2 }, 0);
    const controls = globe.controls();
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;

    const ro = new ResizeObserver(() => {
      globe.width(el.clientWidth).height(el.clientHeight);
    });
    ro.observe(el);

    const timers = timersRef.current;
    return () => {
      ro.disconnect();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      globe._destructor();
      globeRef.current = null;
      el.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New launch event from the game -> play the strike
  useEffect(() => {
    if (!launch || launch.id === lastLaunchIdRef.current) return;
    lastLaunchIdRef.current = launch.id;
    fire(launch.a, launch.b);
  }, [launch, fire]);

  // Server truth for destroyed state; ignored mid-strike so the
  // animation's own timing controls the blackout
  useEffect(() => {
    if (Date.now() < strikeUntilRef.current) return;
    destroyedRef.current = { ...destroyed };
    refreshColors();
  }, [destroyed, refreshColors]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
