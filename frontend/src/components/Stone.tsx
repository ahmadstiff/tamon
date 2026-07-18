"use client";

import {useGSAP} from "@gsap/react";
import DOMPurify from "dompurify";
import gsap from "gsap";
import {useMemo, useRef} from "react";
import {CLASSIFICATION, classify, erosion, type Classification, type Commitment} from "@/lib/tamon";

interface Props {
  svg: string | null;
  commitment: Commitment;
  now: number;
  size?: number;
}

/// The stone, and the one place motion is spent.
///
/// The SVG is injected inline rather than set as an <img src="data:...">, because GSAP cannot
/// reach paths inside an image. Inline injection of remote markup is an XSS surface, so it is
/// sanitised first.
///
/// As shipped this is defence in depth rather than a live hole: the contract builds the SVG
/// entirely from compile-time constants in TamonArt, and the one user-supplied string — the
/// repo name — goes into the JSON description, never into the markup. The risk it actually
/// closes is configuration: NEXT_PUBLIC_TAMON_ADDRESS pointing at a contract we don't control,
/// through a misconfigured deploy or a fork. An SVG can carry <script>, so that would be
/// arbitrary code execution. Sanitising costs one dependency and nothing we need survives it.
export function Stone({svg, commitment, now, size = 240}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const lastClass = useRef<Classification | null>(null);

  const safeSvg = useMemo(
    () => (svg ? DOMPurify.sanitize(svg, {USE_PROFILES: {svg: true, svgFilters: true}}) : null),
    [svg],
  );

  const cls = classify(commitment, now);
  const pct = erosion(commitment, now);
  const terminal = cls === "hancur" || cls === "kristal";

  // One tween for the stone's whole remaining life, rather than a new tween each tick.
  // Erosion then reads as genuinely continuous instead of stepping once a second, and the
  // browser does the interpolation.
  useGSAP(
    () => {
      if (!bar.current) return;

      const remaining = Math.max(0, Number(commitment.deadline) - now);
      gsap.killTweensOf(bar.current);

      if (terminal || remaining === 0) {
        gsap.set(bar.current, {scaleX: terminal ? 1 : pct});
        return;
      }

      gsap.fromTo(
        bar.current,
        {scaleX: pct},
        {scaleX: 1, duration: remaining, ease: "none"},
      );
    },
    {scope: root, dependencies: [commitment.deadline, commitment.state, terminal]},
  );

  // Crack propagation. When the classification changes, the newly-revealed fracture draws
  // itself instead of appearing between two frames — that moment is when consequence becomes
  // visible, and popping it in wastes it.
  useGSAP(
    () => {
      const previous = lastClass.current;
      lastClass.current = cls;

      // Nothing to reveal on first paint; the stone should already look its age.
      if (previous === null || previous === cls || !root.current) return;
      // Reduced motion means the state still changes — it just cuts rather than draws.
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const cracks = root.current.querySelectorAll<SVGPathElement>("svg path[stroke][fill='none']");
      if (cracks.length === 0) return;

      cracks.forEach((path) => {
        const len = path.getTotalLength();
        gsap.fromTo(
          path,
          {strokeDasharray: len, strokeDashoffset: len},
          {strokeDashoffset: 0, duration: 0.9, ease: "power2.out"},
        );
      });

      // The two terminal moments are the ones a judge actually watches. Everything else stays
      // quiet so these land.
      if (cls === "hancur") {
        gsap.fromTo(
          root.current.querySelector("svg"),
          {x: 0},
          {x: 0, duration: 0.5, ease: "power4.out", keyframes: {x: [-6, 5, -3, 2, 0]}},
        );
      }
      if (cls === "kristal") {
        gsap.fromTo(
          root.current.querySelectorAll<SVGPathElement>("svg path[fill='#E8B23A']"),
          {opacity: 0, scale: 0.94, transformOrigin: "50% 50%"},
          {opacity: 0.9, scale: 1, duration: 0.7, ease: "back.out(1.6)"},
        );
      }
    },
    {scope: root, dependencies: [cls]},
  );

  return (
    <div ref={root} className="flex flex-col gap-3">
      {/* `size` is an upper bound, not a fixed width. A hard width silently clips the stone on
          narrow screens — the landing wrapper has overflow-hidden, so the page reports no
          overflow while the artwork is being cut off. aspect-square keeps it square as it
          shrinks. */}
      <div
        className="bg-void border-crack relative aspect-square w-full border"
        style={{maxWidth: size}}
        aria-label={`Stone classified ${CLASSIFICATION[cls].label} — ${CLASSIFICATION[cls].gloss}`}
      >
        {safeSvg ? (
          <div className="[&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{__html: safeSvg}} />
        ) : (
          <div className="w-full h-full opacity-30 bg-surface" />
        )}
      </div>

      {/* The erosion line. The contract can only render five discrete states, so a stone at
          51% looks identical to one at 79%. This is the continuous signal that fills the gap. */}
      <div className="flex w-full flex-col gap-1.5" style={{maxWidth: size}}>
        <div className="h-px bg-crack overflow-hidden">
          <div ref={bar} className="h-px bg-accent origin-left" style={{transform: "scaleX(0)"}} />
        </div>
        <div className="flex justify-between items-baseline">
          <span className="data text-[11px] tracking-[0.14em] text-muted">
            {CLASSIFICATION[cls].label}
            <span className="text-crack"> / </span>
            {CLASSIFICATION[cls].gloss}
          </span>
          <span className="data text-[11px] text-muted">{(pct * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
