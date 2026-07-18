"use client";

import Link from "next/link";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useAccount} from "wagmi";
import {ConnectPrompt, EmptyStones, Shell, StoneSkeleton} from "@/components/Shell";
import {Stone} from "@/components/Stone";
import {useNow, useOwnedStones, useStone} from "@/hooks/useStone";
import {State, timeLeft, type Commitment} from "@/lib/tamon";

type Group = "at-risk" | "settled" | "forfeited";

const GROUPS: {key: Group; label: string; blurb: string}[] = [
  {key: "at-risk", label: "At risk", blurb: "Running now. The clock is against you."},
  {key: "settled", label: "Settled", blurb: "Target met. Principal, yield and prize share are yours."},
  {key: "forfeited", label: "Forfeited", blurb: "Missed. These funded the commitments that landed."},
];

function groupOf(c: Commitment): Group {
  if (c.state === State.Succeeded) return "settled";
  if (c.state === State.Failed) return "forfeited";
  return "at-risk";
}

/// One specimen on the shelf. The card is the primary surface, not a teaser for a detail page —
/// two fit side by side at 1280px, which is what lets a demo hold the failing and the
/// succeeding stone on screen together.
function SpecimenCard({tokenId, onLoad}: {tokenId: bigint; onLoad: (id: string, c: Commitment) => void}) {
  const {commitment, svg, isPending} = useStone(tokenId);
  const now = useNow();

  // Reporting up during render would be a setState-in-render. The guard in `record` stops it
  // looping, but the write still belongs in an effect.
  useEffect(() => {
    if (commitment) onLoad(String(tokenId), commitment);
  }, [commitment, tokenId, onLoad]);

  if (isPending || !commitment) return <StoneSkeleton />;

  const active = commitment.state === State.Active;
  const overdue = active && now >= Number(commitment.deadline);

  return (
    <Link href={`/stone/${tokenId}`} className="group flex w-full max-w-[240px] flex-col gap-4">
      <Stone svg={svg} commitment={commitment} now={now} size={240} />

      <div className="flex w-full flex-col gap-2">
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
  const [active, setActive] = useState<Group>("at-risk");

  // Each card reports its commitment once loaded, so the tabs can show counts and route ids
  // without the dashboard re-fetching everything a second time.
  const [seen, setSeen] = useState<Record<string, Commitment>>({});
  // Stable identity so the effect above doesn't re-fire on every dashboard render.
  const record = useCallback(
    (id: string, c: Commitment) =>
      setSeen((prev) => (prev[id]?.state === c.state ? prev : {...prev, [id]: c})),
    [],
  );

  const {counts, byGroup} = useMemo(() => {
    const counts: Record<Group, number> = {"at-risk": 0, settled: 0, forfeited: 0};
    const byGroup: Record<Group, bigint[]> = {"at-risk": [], settled: [], forfeited: []};
    const unknown: bigint[] = [];

    for (const id of [...tokenIds].reverse()) {
      const c = seen[String(id)];
      if (!c) {
        unknown.push(id);
        continue;
      }
      const g = groupOf(c);
      counts[g]++;
      byGroup[g].push(id);
    }
    // Not yet loaded — render under At risk so the skeletons have somewhere to live.
    byGroup["at-risk"].push(...unknown);
    return {counts, byGroup};
  }, [tokenIds, seen]);

  const shown = byGroup[active];
  const group = GROUPS.find((g) => g.key === active)!;

  return (
    <Shell>
      {!isConnected ? (
        <ConnectPrompt />
      ) : (
        <div className="flex flex-col gap-8">
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
            <>
              {/* Outcome is the axis that matters here: what still needs work, what paid out,
                  what didn't. Sorting by date would bury a stone about to expire under
                  finished ones. */}
              <div className="border-crack flex flex-wrap gap-px border-b">
                {GROUPS.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setActive(g.key)}
                    className={`data -mb-px border-b-2 px-4 py-3 text-[11px] tracking-[0.14em] uppercase ${
                      active === g.key
                        ? "border-accent text-accent"
                        : "text-muted hover:text-text border-transparent"
                    }`}
                  >
                    {g.label}
                    <span className="ml-2 opacity-60">{counts[g.key]}</span>
                  </button>
                ))}
              </div>

              <p className="text-muted -mt-4 text-sm">{group.blurb}</p>

              {shown.length === 0 ? (
                <p className="text-muted py-10 text-sm">
                  {active === "at-risk"
                    ? "Nothing running. Start a commitment and the clock begins."
                    : active === "settled"
                      ? "Nothing settled yet."
                      : "Nothing forfeited. Keep it that way."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-x-10 gap-y-12">
                  {shown.map((id) => (
                    <SpecimenCard key={String(id)} tokenId={id} onLoad={record} />
                  ))}
                </div>
              )}

              {/* Cards outside the active tab still need to load so their group is known.
                  Mounted hidden rather than skipped, which keeps the counts honest. */}
              <div className="hidden">
                {tokenIds
                  .filter((id) => !shown.includes(id))
                  .map((id) => (
                    <SpecimenCard key={`probe-${id}`} tokenId={id} onLoad={record} />
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </Shell>
  );
}
