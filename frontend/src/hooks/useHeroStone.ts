"use client";

import {useReadContract, useReadContracts} from "wagmi";
import {TAMON_ABI, TAMON_ADDRESS, decodeTokenUri, type Commitment} from "@/lib/tamon";

const CANDIDATES = 6;

/// Picks a stone for the landing hero without hammering the RPC.
///
/// The naive version read `getCommitment` *and* `tokenURI` for every candidate on a 5s poll —
/// roughly 200 requests a minute against the public endpoint, which answered with HTTP 429 and
/// left the hero blank. During judging that would look like a broken product.
///
/// Three changes make it cheap:
///   - candidates are batched into one multicall instead of N round trips
///   - only `getCommitment` is fetched while searching; it's small, and `tokenURI` returns a
///     full base64 SVG that is wasted on the ones we discard
///   - `tokenURI` is fetched for the single chosen token, and only that read polls quickly,
///     because it's the one that has to visibly change
export function useHeroStone(): {commitment?: Commitment; svg: string | null; live: boolean} {
  const enabled = Boolean(TAMON_ADDRESS);

  const nextId = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "nextId",
    query: {enabled, refetchInterval: 60_000, staleTime: 60_000},
  });

  const latest = Number((nextId.data as bigint | undefined) ?? 1n) - 1;
  const ids = Array.from({length: CANDIDATES}, (_, i) => latest - i).filter((n) => n >= 1);

  const commitments = useReadContracts({
    contracts: ids.map((id) => ({
      address: TAMON_ADDRESS,
      abi: TAMON_ABI,
      functionName: "getCommitment" as const,
      args: [BigInt(id)],
    })),
    query: {enabled: enabled && ids.length > 0, refetchInterval: 30_000, staleTime: 20_000},
  });

  const found = (commitments.data ?? [])
    .map((r, i) => ({c: r.result as Commitment | undefined, id: ids[i]!}))
    .filter((x) => x.c);

  // Prefer one that's still running — the hero's caption claims live weathering.
  const chosen = found.find((x) => x.c!.state === 1) ?? found[0];

  const uri = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "tokenURI",
    args: chosen ? [BigInt(chosen.id)] : undefined,
    query: {enabled: enabled && Boolean(chosen), refetchInterval: 15_000},
  });

  const art = typeof uri.data === "string" ? decodeTokenUri(uri.data) : null;

  return {
    commitment: chosen?.c,
    svg: art?.svg ?? null,
    live: chosen?.c?.state === 1,
  };
}
