"use client";

import {useEffect, useState} from "react";
import {useReadContract} from "wagmi";
import {TAMON_ABI, TAMON_ADDRESS, decodeTokenUri, type Commitment} from "@/lib/tamon";

/// Ticks once a second off the local clock.
///
/// Deliberately separate from the chain poll: the countdown must move every second, but
/// re-reading the chain every second would be wasteful and would make the number stutter
/// whenever a request was slow.
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/// One commitment plus its on-chain artwork.
///
/// tokenURI is re-read every 5s so a state change lands without a refresh. The artwork itself
/// is a pure function of block.timestamp, which is the whole point — nothing has to happen for
/// the stone to weather.
export function useStone(tokenId: bigint | undefined) {
  const enabled = tokenId !== undefined && Boolean(TAMON_ADDRESS);

  const commitment = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "getCommitment",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {enabled, refetchInterval: 5000},
  });

  const uri = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "tokenURI",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: {enabled, refetchInterval: 5000},
  });

  const art = typeof uri.data === "string" ? decodeTokenUri(uri.data) : null;

  return {
    commitment: commitment.data as Commitment | undefined,
    svg: art?.svg ?? null,
    isPending: commitment.isPending || uri.isPending,
    error: commitment.error ?? uri.error,
    refetch: () => {
      void commitment.refetch();
      void uri.refetch();
    },
  };
}

/// Token ids owned by an address, in one call. The contract keeps an append-only list
/// precisely so this doesn't need N+1 round trips.
export function useOwnedStones(owner: `0x${string}` | undefined) {
  const q = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "tokensOf",
    args: owner ? [owner] : undefined,
    query: {enabled: Boolean(owner && TAMON_ADDRESS), refetchInterval: 5000},
  });

  return {
    tokenIds: (q.data as bigint[] | undefined) ?? [],
    isPending: q.isPending,
    refetch: q.refetch,
  };
}
