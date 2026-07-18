"use client";

import Link from "next/link";
import {useAccount} from "wagmi";
import {ConnectPrompt, EmptyStones, Shell, StoneSkeleton} from "@/components/Shell";
import {Stone} from "@/components/Stone";
import {useNow, useOwnedStones, useStone} from "@/hooks/useStone";
import {State, timeLeft} from "@/lib/tamon";

/// One specimen on the shelf. The card is the primary surface, not a teaser for a detail page —
/// two fit side by side at 1280px, which is what lets a demo hold the failing and the
/// succeeding stone on screen together.
function SpecimenCard({tokenId}: {tokenId: bigint}) {
  const {commitment, svg, isPending} = useStone(tokenId);
  const now = useNow();

  if (isPending || !commitment) return <StoneSkeleton />;

  const active = commitment.state === State.Active;
  const overdue = active && now >= Number(commitment.deadline);

  return (
    <Link href={`/stone/${tokenId}`} className="group flex flex-col gap-4">
      <Stone svg={svg} commitment={commitment} now={now} size={240} />

      <div className="flex flex-col gap-2" style={{width: 240}}>
        <span className="label">Specimen {String(tokenId).padStart(3, "0")}</span>
        <p className="font-display group-hover:text-accent leading-tight font-semibold break-all">
          {commitment.repo}
        </p>
        <div className="flex items-baseline justify-between">
          <span className="data text-muted text-xs">
            {commitment.achieved}/{commitment.target} commits
          </span>
          <span className="data text-xs">
            {active
              ? overdue
                ? "overdue"
                : timeLeft(commitment.deadline, now)
              : commitment.state === State.Succeeded
                ? "settled"
                : "forfeited"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const {address, isConnected} = useAccount();
  const {tokenIds, isPending} = useOwnedStones(address);

  return (
    <Shell>
      {!isConnected ? (
        <ConnectPrompt />
      ) : (
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="label">Collection</span>
              <h1 className="font-display text-2xl font-extrabold">Your specimens</h1>
            </div>
            <Link
              href="/new"
              className="data bg-accent text-void px-4 py-2 text-[11px] font-medium tracking-[0.14em] uppercase"
            >
              New commitment
            </Link>
          </div>

          {isPending ? (
            <div className="flex flex-wrap gap-10">
              <StoneSkeleton />
              <StoneSkeleton />
            </div>
          ) : tokenIds.length === 0 ? (
            <EmptyStones />
          ) : (
            <div className="flex flex-wrap gap-x-10 gap-y-12">
              {/* Newest first — the stone you're currently sweating over belongs at the top. */}
              {[...tokenIds].reverse().map((id) => (
                <SpecimenCard key={String(id)} tokenId={id} />
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}
