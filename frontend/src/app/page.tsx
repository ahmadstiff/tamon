"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {useReadContract} from "wagmi";
import {LandingNav} from "@/components/LandingNav";
import SpecularButton from "@/components/SpecularButton";
import {Stone} from "@/components/Stone";
import {useNow} from "@/hooks/useStone";
import {EXPLORER} from "@/lib/chain";
import {TAMON_ABI, TAMON_ADDRESS, decodeTokenUri, type Commitment} from "@/lib/tamon";

// WebGL, and useless to the server. Loading it client-only keeps it out of the app routes
// entirely — the dashboard never pays for the landing page's atmosphere.
const Galaxy = dynamic(() => import("@/components/Galaxy"), {ssr: false});

/// The hero is a real stone, read live from the contract, weathering while you look at it.
///
/// That is the product's whole argument made self-evident: consequence you can watch accumulate
/// before the deadline. A rendered mockup would say the same thing and prove nothing.
function LiveStone() {
  const now = useNow();

  const commitment = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "getCommitment",
    args: [1n],
    query: {enabled: Boolean(TAMON_ADDRESS), refetchInterval: 5000},
  });

  const uri = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "tokenURI",
    args: [1n],
    query: {enabled: Boolean(TAMON_ADDRESS), refetchInterval: 5000},
  });

  const c = commitment.data as Commitment | undefined;
  const art = typeof uri.data === "string" ? decodeTokenUri(uri.data) : null;

  if (!c) return <div className="border-crack h-[320px] w-[320px] border opacity-30" />;
  return <Stone svg={art?.svg ?? null} commitment={c} now={now} size={320} />;
}

export default function Landing() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Desaturated to zero and kept dim. At these settings it reads as mineral dust rather
          than a starfield, which is what lets it sit under a geological subject without
          turning the page into a space theme — and it keeps the single-accent rule intact. */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <Galaxy
          density={0.6}
          glowIntensity={0.15}
          saturation={0}
          hueShift={0}
          twinkleIntensity={0.2}
          rotationSpeed={0.02}
          starSpeed={0.15}
          mouseInteraction={false}
          transparent
        />
      </div>

      <div className="relative z-10">
        <div className="px-6 pt-6">
          <LandingNav />
        </div>

        <section className="mx-auto flex max-w-5xl flex-col items-start gap-12 px-6 pt-24 pb-20 md:flex-row md:items-center md:gap-20">
          <div className="flex max-w-xl flex-col gap-7">
            <span className="label">Commitment staking on Monad</span>

            <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight md:text-6xl">
              Your repo doesn&rsquo;t care that you quit.
              <br />
              <span className="text-accent">This does.</span>
            </h1>

            <p className="text-muted text-lg leading-relaxed">
              Stake MON against a commit target. Hit it and you get your stake back with staking
              yield, plus a share of everyone who missed. Miss it and your stake funds the people
              who didn&rsquo;t.
            </p>

            <div className="flex flex-wrap items-center gap-5">
              <Link href="/app">
                <SpecularButton>Open the app</SpecularButton>
              </Link>
              <a
                href={`${EXPLORER}/address/${TAMON_ADDRESS}`}
                className="data text-muted hover:text-text text-[11px] tracking-[0.14em] uppercase"
              >
                View contract
              </a>
            </div>
          </div>

          <div id="stone" className="flex shrink-0 flex-col gap-4">
            <LiveStone />
            <p className="text-muted max-w-[320px] text-xs">
              A real commitment on-chain, weathering right now. Nothing is animating a mockup —
              the artwork is a function of <span className="data text-text">block.timestamp</span>,
              rendered by the contract itself.
            </p>
          </div>
        </section>

        <section id="how" className="border-crack border-t">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 md:grid-cols-3">
            {[
              {
                k: "Money that keeps working",
                v: "Your stake goes straight into shMON liquid staking. It earns for the whole period instead of sitting in idle escrow.",
              },
              {
                k: "Consequence that is objective",
                v: "Completion is read from GitHub — commits with real diffs on your own repo — not from you telling us you finished.",
              },
              {
                k: "Consequence you feel early",
                v: "The stone weathers as the deadline approaches. It is the only part of this system that speaks to you while you are still procrastinating.",
              },
            ].map((item) => (
              <div key={item.k} className="flex flex-col gap-3">
                <span className="label">{item.k}</span>
                <p className="text-muted text-sm leading-relaxed">{item.v}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-crack border-t">
          <div className="text-muted mx-auto flex max-w-5xl flex-wrap justify-between gap-4 px-6 py-6 text-[13px]">
            <p>
              Completion is attested by Tamon&rsquo;s verifier key.{" "}
              <span className="text-text">Trust-minimised, not trustless.</span>
            </p>
            <a href="https://github.com/ahmadstiff/tamon" className="hover:text-text">
              Source
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
