"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {useReadContract} from "wagmi";
import {LandingNav} from "@/components/LandingNav";
import {ProtocolFlow} from "@/components/ProtocolFlow";
import {SmoothAnchors} from "@/components/SmoothAnchors";
import {StoneStates} from "@/components/StoneStates";
import SpecularButton from "@/components/SpecularButton";
import {Stone} from "@/components/Stone";
import {useNow, useStone} from "@/hooks/useStone";
import {EXPLORER} from "@/lib/chain";
import {State, TAMON_ABI, TAMON_ADDRESS} from "@/lib/tamon";

// WebGL, and useless to the server. Loading it client-only keeps it out of the app routes
// entirely — the dashboard never pays for the landing page's atmosphere.
const Galaxy = dynamic(() => import("@/components/Galaxy"), {ssr: false});

/// The hero is a real stone, read live from the contract, weathering while you look at it.
///
/// That is the product's whole argument made self-evident: consequence you can watch accumulate
/// before the deadline. A rendered mockup would say the same thing and prove nothing.
function LiveStone() {
  const now = useNow();

  const nextId = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "nextId",
    query: {enabled: Boolean(TAMON_ADDRESS), refetchInterval: 15000},
  });

  // Search the last eight tokens for one that is still running.
  //
  // Three was not enough: the newest tokens are the ones most likely to have already settled or
  // expired, so a short window kept landing on a terminal stone — the hero showed HANCUR at
  // 100% under a caption promising "weathering right now", which contradicts itself.
  const latest = Number((nextId.data as bigint | undefined) ?? 1n) - 1;
  const ids = Array.from({length: 8}, (_, i) => latest - i).filter((n) => n >= 1);

  const stones = [
    useStone(ids[0] !== undefined ? BigInt(ids[0]) : undefined),
    useStone(ids[1] !== undefined ? BigInt(ids[1]) : undefined),
    useStone(ids[2] !== undefined ? BigInt(ids[2]) : undefined),
    useStone(ids[3] !== undefined ? BigInt(ids[3]) : undefined),
    useStone(ids[4] !== undefined ? BigInt(ids[4]) : undefined),
    useStone(ids[5] !== undefined ? BigInt(ids[5]) : undefined),
    useStone(ids[6] !== undefined ? BigInt(ids[6]) : undefined),
    useStone(ids[7] !== undefined ? BigInt(ids[7]) : undefined),
  ];

  const live = stones.find((s) => s.commitment?.state === State.Active);
  const picked = live ?? stones.find((s) => s.commitment);

  if (!picked?.commitment) {
    return <div className="border-crack aspect-square w-full max-w-[320px] border opacity-30" />;
  }

  return (
    <>
      <Stone svg={picked.svg} commitment={picked.commitment} now={now} size={320} />
      {/* The caption has to match what is actually on screen. Claiming live weathering over a
          settled stone is the kind of small dishonesty that costs more than it buys. */}
      <p className="text-muted text-xs">
        {live ? (
          <>
            A real commitment on-chain, weathering right now. Nothing is animating a mockup — the
            artwork is a function of <span className="data text-text">block.timestamp</span>,
            rendered by the contract itself.
          </>
        ) : (
          <>
            A real commitment on-chain, already settled. The artwork is a function of{" "}
            <span className="data text-text">block.timestamp</span>, rendered by the contract
            itself — nothing is animating a mockup.
          </>
        )}
      </p>
    </>
  );
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

      <SmoothAnchors />

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

          <div id="stone" className="flex w-full max-w-[320px] shrink-0 flex-col gap-4">
            <LiveStone />
          </div>
        </section>

        {/* Four numbered steps, because this genuinely is a sequence and the order carries
            information the reader needs — particularly step 2, which is the one that trips
            people up. */}
        <section id="how" className="border-crack border-t">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <div className="mb-10 flex flex-col gap-2">
              <span className="label">How to use it</span>
              <h2 className="font-display text-2xl font-extrabold">Four steps, about a minute.</h2>
            </div>

            <ol className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  n: "01",
                  k: "Connect and pick a repo",
                  v: "Any public repo you own. Commits are counted against the GitHub account you link, so it has to be yours.",
                },
                {
                  n: "02",
                  k: "Set the target, then commit",
                  v: "Choose how many commits and by when, and stake at least 0.1 MON. Only work pushed after this moment counts — the clock starts here.",
                },
                {
                  n: "03",
                  k: "Do the work",
                  v: "Push real commits. Empty ones are ignored. Meanwhile the stone weathers: intact, worn, cracked.",
                },
                {
                  n: "04",
                  k: "Claim before the deadline",
                  v: "Link GitHub once, then claim. We read your commits, sign the result, and the contract pays out. Miss the deadline and your stake goes to everyone who didn't.",
                },
              ].map((s) => (
                <li key={s.n} className="flex flex-col gap-3">
                  <span className="data text-accent text-[11px] tracking-[0.14em]">{s.n}</span>
                  <span className="font-display border-crack border-t pt-3 font-semibold">
                    {s.k}
                  </span>
                  <p className="text-muted text-sm leading-relaxed">{s.v}</p>
                </li>
              ))}
            </ol>

            <div className="border-crack mt-12 flex flex-col gap-6 border-t pt-10 md:flex-row md:gap-10">
              {[
                {
                  k: "Where your stake sits",
                  v: "In shMON liquid staking, earning for the whole period rather than idling in escrow. You get the yield too.",
                },
                {
                  k: "What you need",
                  v: "A wallet on Monad testnet and some MON from the faucet. The app will offer to switch networks for you.",
                },
                {
                  k: "What we can and can't see",
                  v: "Only public commits on the repo you named, by the account you linked. We never get write access.",
                },
              ].map((f) => (
                <div key={f.k} className="flex flex-1 flex-col gap-2">
                  <span className="label">{f.k}</span>
                  <p className="text-muted text-sm leading-relaxed">{f.v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <StoneStates />

        <ProtocolFlow />

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
