"use client";

import {formatEther} from "viem";
import {useReadContract} from "wagmi";
import {EXPLORER} from "@/lib/chain";

const SHMON = "0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9" as const;

/// Just the reads needed to prove the vault is real and moving.
const SHMON_ABI = [
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{name: "shares", type: "uint256"}],
    outputs: [{type: "uint256"}],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "uint256"}],
  },
] as const;

const STAGES = [
  {
    n: "01",
    k: "You stake MON",
    v: "Native MON leaves your wallet in the same transaction that mints the stone.",
  },
  {
    n: "02",
    k: "Tamon deposits into shMON",
    v: "FastLane's liquid staking vault. ERC-7535, so native MON goes in directly — no wrapping, no approval step.",
  },
  {
    n: "03",
    k: "It earns while it's locked",
    v: "The vault's exchange rate rises every block. Your position is held as shares, so the yield accrues to you without any further transaction.",
  },
  {
    n: "04",
    k: "You redeem, or take the shares",
    v: "Redemption is synchronous — no unbonding queue. If the vault's global ceiling is ever exhausted, you can take the shMON itself instead.",
  },
];

/// Makes the ecosystem integration visible. It's real — the contract deposits into and redeems
/// from shMON on every commitment — but nothing on the page said so, and a live rate proves it
/// in a way a logo cannot.
export function ProtocolFlow() {
  const rate = useReadContract({
    address: SHMON,
    abi: SHMON_ABI,
    functionName: "convertToAssets",
    args: [10n ** 18n],
    query: {refetchInterval: 10000},
  });

  const tvl = useReadContract({
    address: SHMON,
    abi: SHMON_ABI,
    functionName: "totalAssets",
    query: {refetchInterval: 30000},
  });

  const rateValue = rate.data as bigint | undefined;
  const tvlValue = tvl.data as bigint | undefined;

  return (
    <section id="protocol" className="border-crack border-t">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="mb-10 flex flex-col gap-2">
          <span className="label">Built on Monad&rsquo;s DeFi</span>
          <h2 className="font-display text-2xl font-extrabold">
            Your stake doesn&rsquo;t sit still.
          </h2>
          <p className="text-muted max-w-2xl text-sm leading-relaxed">
            Escrow that idles is wasted capital. Tamon routes every stake through{" "}
            <a
              href={`${EXPLORER}/address/${SHMON}`}
              className="text-text underline decoration-crack underline-offset-4 hover:decoration-accent"
            >
              shMON
            </a>
            , FastLane&rsquo;s liquid staking vault on Monad, so it earns for the whole
            commitment and the yield comes back to you along with the principal.
          </p>
        </div>

        <ol className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((s) => (
            <li key={s.n} className="flex flex-col gap-3">
              <span className="data text-accent text-[11px] tracking-[0.14em]">{s.n}</span>
              <span className="font-display border-crack border-t pt-3 font-semibold">{s.k}</span>
              <p className="text-muted text-sm leading-relaxed">{s.v}</p>
            </li>
          ))}
        </ol>

        {/* Read live from the vault. A static number would prove nothing; this one moves. */}
        <div className="border-crack mt-12 grid gap-6 border-t pt-8 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <span className="label">shMON rate, live</span>
            <span className="data text-lg">
              {rateValue ? `${Number(formatEther(rateValue)).toFixed(4)} MON` : "—"}
            </span>
            <span className="text-muted text-xs">
              Per share, rising every block. Not 1:1 — anything assuming that is wrong by ~11x.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="label">Vault TVL</span>
            <span className="data text-lg">
              {tvlValue ? `${Math.round(Number(formatEther(tvlValue))).toLocaleString()} MON` : "—"}
            </span>
            <span className="text-muted text-xs">FastLane shMonad, Monad testnet.</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="label">Why this vault</span>
            <span className="text-muted text-sm leading-relaxed">
              It&rsquo;s the one with synchronous redemption. The alternatives queue withdrawals
              behind an unbonding period, which breaks a product that has to return funds on a
              deadline.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
