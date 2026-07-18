"use client";

import Link from "next/link";
import {useParams} from "next/navigation";
import {useEffect, useState} from "react";
import {formatEther} from "viem";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {ConnectPrompt, ErrorNote, Shell, StoneSkeleton} from "@/components/Shell";
import {Stone} from "@/components/Stone";
import {useNow, useStone} from "@/hooks/useStone";
import {AttestError, requestAttestation} from "@/lib/attest";
import {EXPLORER} from "@/lib/chain";
import {beginGithubLink, loadSession} from "@/lib/session";
import {State, TAMON_ABI, TAMON_ADDRESS, timeLeft} from "@/lib/tamon";

const GITHUB_CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "";

function Row({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <span className="data text-lg">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export default function StonePage() {
  const params = useParams<{id: string}>();
  const tokenId = BigInt(params.id);
  const {address, isConnected} = useAccount();
  const now = useNow();

  const {commitment, svg, isPending, refetch} = useStone(tokenId);
  const {writeContractAsync, isPending: signing} = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({hash});

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [reaping, setReaping] = useState(false);

  const claimable = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "claimableShares",
    args: address ? [address] : undefined,
    query: {enabled: Boolean(address && TAMON_ADDRESS), refetchInterval: 5000},
  });

  const withdrawable = useReadContract({
    address: TAMON_ADDRESS,
    abi: TAMON_ABI,
    functionName: "withdrawableNow",
    args: address ? [address] : undefined,
    query: {enabled: Boolean(address && TAMON_ADDRESS), refetchInterval: 5000},
  });

  const active = commitment?.state === State.Active;
  const overdue = Boolean(commitment && active && now >= Number(commitment.deadline));

  // Reap-on-view.
  //
  // Failed is only reachable through a transaction, so at deadline+1s the stone still renders
  // as cracked. Left alone, the demo's climax is the exact moment where time alone does
  // nothing. reap() is permissionless, so whoever is looking can settle it.
  useEffect(() => {
    if (!overdue || !isConnected || reaping || hash) return;
    setReaping(true);
    void (async () => {
      try {
        const tx = await writeContractAsync({
          address: TAMON_ADDRESS,
          abi: TAMON_ABI,
          functionName: "reap",
          args: [tokenId],
        });
        setHash(tx);
      } catch {
        setReaping(false); // someone else may have reaped it first; the poll will show that
      }
    })();
  }, [overdue, isConnected, reaping, hash, tokenId, writeContractAsync]);

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch();
      void claimable.refetch();
      setHash(undefined);
      setClaiming(false);
      setReaping(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess]);

  async function claim() {
    if (!commitment) return;
    setError(null);
    setNote(null);

    const session = loadSession();
    if (!session) {
      if (!GITHUB_CLIENT_ID) {
        setError("GitHub linking isn't configured on this deployment.");
        return;
      }
      beginGithubLink(GITHUB_CLIENT_ID);
      return;
    }

    setClaiming(true);
    try {
      const result = await requestAttestation(tokenId, session.token);

      if (!result.signed) {
        setNote(result.reason ?? `${result.achieved}/${result.target} commits so far.`);
        setClaiming(false);
        return;
      }

      const tx = await writeContractAsync({
        address: TAMON_ADDRESS,
        abi: TAMON_ABI,
        functionName: "settle",
        args: [tokenId, result.achieved, BigInt(result.expiry!), result.signature!],
      });
      setHash(tx);
    } catch (e) {
      if (e instanceof AttestError) {
        setError(e.retryable ? `${e.message} Try again in a moment.` : e.message);
      } else {
        setError("That transaction didn't go through.");
      }
      setClaiming(false);
    }
  }

  async function withdraw() {
    setError(null);
    try {
      const tx = await writeContractAsync({
        address: TAMON_ADDRESS,
        abi: TAMON_ABI,
        functionName: "withdraw",
        args: [2n ** 256n - 1n],
      });
      setHash(tx);
    } catch {
      setError("That transaction didn't go through.");
    }
  }

  if (!isConnected) {
    return (
      <Shell>
        <ConnectPrompt />
      </Shell>
    );
  }

  if (isPending || !commitment) {
    return (
      <Shell>
        <StoneSkeleton size={360} />
      </Shell>
    );
  }

  const failed = commitment.state === State.Failed;
  const succeeded = commitment.state === State.Succeeded;
  const claimShares = (claimable.data as bigint | undefined) ?? 0n;
  const nowShares = (withdrawable.data as bigint | undefined) ?? 0n;
  const clamped = nowShares < claimShares;

  return (
    <Shell>
      <div className="flex flex-col gap-10 md:flex-row md:gap-14">
        <div className="shrink-0">
          <Stone svg={svg} commitment={commitment} now={now} size={360} />
        </div>

        <div className="flex flex-1 flex-col gap-8">
          <div className="flex flex-col gap-1">
            <span className="label">Specimen {params.id.padStart(3, "0")}</span>
            <h1 className="font-display text-2xl font-extrabold break-all">{commitment.repo}</h1>
          </div>

          {/* The limbo state. Past the deadline the stone is still Active on-chain, and saying
              so plainly is better than letting the artwork imply time shattered it. */}
          {overdue && active && (
            <div className="border border-accent/40 bg-accent/10 px-4 py-3">
              <p className="text-sm">
                Deadline passed — sealing this stone on-chain
                {reaping ? "…" : ". Confirm the transaction to finish."}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6">
            {/* `achieved` is only written on-chain at settle, so it reads 0 no matter how much
                you've pushed. Labelling it "recorded" stops that from looking like the app
                failing to see your work. */}
            <Row
              label="Target"
              value={`${commitment.achieved}/${commitment.target} commits`}
              hint={
                active
                  ? "Recorded on-chain at settlement — claim to check GitHub now"
                  : "Recorded on-chain"
              }
            />
            <Row
              label={active ? "Time left" : "Outcome"}
              value={
                active
                  ? overdue
                    ? "expired"
                    : timeLeft(commitment.deadline, now)
                  : succeeded
                    ? "Settled"
                    : "Forfeited"
              }
            />
            <Row
              label="Staked"
              value={`${Number(formatEther(commitment.shares)).toFixed(4)} shMON`}
              hint="Principal, held as liquid staking shares"
            />
            <Row
              label="Claimable"
              value={`${Number(formatEther(claimShares)).toFixed(4)} shMON`}
              hint={
                clamped
                  ? `${Number(formatEther(nowShares)).toFixed(4)} available right now — the vault's redeem ceiling is shared`
                  : "Principal + yield + prize share"
              }
            />
          </div>

          {error && <ErrorNote message={error} onRetry={() => setError(null)} />}
          {note && (
            <div className="border border-crack bg-surface px-4 py-3">
              <p className="text-sm">{note}</p>
              <p className="mt-1 text-xs text-muted">
                Push more commits, then claim again. Empty commits aren&rsquo;t counted.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {active && !overdue && (
              <button
                onClick={claim}
                disabled={claiming || signing || receipt.isLoading}
                className="data bg-accent text-void px-5 py-3 text-[11px] font-medium tracking-[0.14em] uppercase disabled:opacity-50"
              >
                {claiming
                  ? "Checking GitHub…"
                  : signing
                    ? "Signing…"
                    : receipt.isLoading
                      ? "Confirming…"
                      : loadSession()
                        ? "Claim completion"
                        : "Link GitHub to claim"}
              </button>
            )}

            {claimShares > 0n && (
              <button
                onClick={withdraw}
                disabled={signing || receipt.isLoading}
                className="data border-accent text-accent border px-5 py-3 text-[11px] font-medium tracking-[0.14em] uppercase disabled:opacity-50"
              >
                Withdraw to MON
              </button>
            )}
          </div>

          {/* The loss screen. No claim, no withdraw, no decomposition — without its own
              treatment this is a blank action area at the most emotionally loaded moment in
              the product, and it's one of the two branches the demo walks through. State where
              the money went; offer the next commitment. No apology. */}
          {failed && (
            <div className="flex flex-col items-start gap-3 border-t border-crack pt-6">
              <h2 className="font-display text-xl font-extrabold">Forfeited</h2>
              <p className="text-sm text-muted">
                {Number(formatEther(commitment.shares)).toFixed(4)} shMON went to commitments that
                landed, minus a 10% slash fee that leaves circulation entirely.
              </p>
              <Link
                href="/new"
                className="data bg-accent text-void px-5 py-3 text-[11px] font-medium tracking-[0.14em] uppercase"
              >
                Start a new commitment
              </Link>
            </div>
          )}

          <a
            href={`${EXPLORER}/address/${TAMON_ADDRESS}`}
            className="data text-[11px] tracking-[0.14em] text-muted uppercase hover:text-text"
          >
            View contract on MonadVision
          </a>
        </div>
      </div>
    </Shell>
  );
}
