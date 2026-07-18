"use client";

import {useRouter} from "next/navigation";
import {useEffect, useState} from "react";
import {parseEther} from "viem";
import {useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract} from "wagmi";
import {ConnectPrompt, ErrorNote, Shell} from "@/components/Shell";
import {TAMON_ABI, TAMON_ADDRESS, validateRepo} from "@/lib/tamon";

/// Durations the product actually needs. Minutes exist so a three-minute demo can show a whole
/// lifecycle; weeks exist because that's the real use.
const DURATIONS = [
  {label: "5 minutes", seconds: 300},
  {label: "20 minutes", seconds: 1200},
  {label: "1 hour", seconds: 3600},
  {label: "1 day", seconds: 86_400},
  {label: "1 week", seconds: 604_800},
];

export default function NewCommitment() {
  const router = useRouter();
  const {isConnected} = useAccount();
  const publicClient = usePublicClient();

  const [repo, setRepo] = useState("");
  const [target, setTarget] = useState("5");
  const [duration, setDuration] = useState(604_800);
  const [stake, setStake] = useState("0.5");
  const [formError, setFormError] = useState<string | null>(null);

  const {writeContractAsync, isPending, error: writeError, reset} = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({hash});

  useEffect(() => {
    if (receipt.isSuccess) router.push("/");
  }, [receipt.isSuccess, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    reset();

    // Mirrors the contract's own checks so a typo surfaces here rather than as an opaque
    // wallet revert. The contract remains the authority; this is only a faster answer.
    const repoError = validateRepo(repo.trim());
    if (repoError) return setFormError(repoError);

    const n = Number(target);
    if (!Number.isInteger(n) || n < 1) return setFormError("Set a target of at least 1 commit.");

    const value = (() => {
      try {
        return parseEther(stake);
      } catch {
        return null;
      }
    })();
    if (value === null) return setFormError("Enter a stake like 0.5.");
    if (value < parseEther("0.1")) return setFormError("The minimum stake is 0.1 MON.");

    const args = [repo.trim(), n, BigInt(duration)] as const;

    try {
      // Monad charges on the gas LIMIT, not gas used — a loose limit burns the user's MON for
      // real. Estimate, then add a small headroom rather than passing a round number.
      let gas: bigint | undefined;
      try {
        gas = await publicClient?.estimateContractGas({
          address: TAMON_ADDRESS,
          abi: TAMON_ABI,
          functionName: "commit",
          args,
          value,
        });
        if (gas) gas = (gas * 115n) / 100n;
      } catch {
        gas = undefined; // fall back to the wallet's own estimate
      }

      const tx = await writeContractAsync({
        address: TAMON_ADDRESS,
        abi: TAMON_ABI,
        functionName: "commit",
        args,
        value,
        gas,
      });
      setHash(tx);
    } catch {
      // writeError carries the detail; the form keeps every value the user typed.
    }
  }

  if (!isConnected) {
    return (
      <Shell>
        <ConnectPrompt />
      </Shell>
    );
  }

  const busy = isPending || receipt.isLoading;

  return (
    <Shell>
      <div className="flex max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-1">
          <span className="label">New specimen</span>
          <h1 className="font-display text-2xl font-extrabold">What are you committing to?</h1>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="repo" className="label">
              Repository
            </label>
            <input
              id="repo"
              className="field"
              placeholder="owner/name"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted">
              Must be yours — commits are counted against your linked GitHub account.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="target" className="label">
                Commits
              </label>
              <input
                id="target"
                className="field"
                inputMode="numeric"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <p className="text-xs text-muted">Empty commits don&rsquo;t count.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="stake" className="label">
                Stake (MON)
              </label>
              <input
                id="stake"
                className="field"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
              <p className="text-xs text-muted">Minimum 0.1.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="label">Deadline</span>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.seconds}
                  type="button"
                  onClick={() => setDuration(d.seconds)}
                  className={`data border px-3 py-2 text-[11px] tracking-[0.14em] uppercase ${
                    duration === d.seconds
                      ? "border-accent text-accent"
                      : "border-crack text-muted hover:text-text"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              Longer commitments earn a larger share of forfeited stakes — the prize claim is
              weighted by capital and time at risk.
            </p>
          </div>

          {formError && <ErrorNote message={formError} />}
          {writeError && (
            <ErrorNote message="The wallet rejected or failed that transaction. Your entries are still here." />
          )}

          <button
            type="submit"
            disabled={busy}
            className="data bg-accent text-void px-5 py-3 text-[11px] font-medium tracking-[0.14em] uppercase disabled:opacity-50"
          >
            {isPending ? "Signing…" : receipt.isLoading ? "Confirming…" : "Stake and commit"}
          </button>

          <p className="text-xs text-muted">
            Your stake goes straight into shMON liquid staking and earns while it&rsquo;s locked.
            Hit the target and you get it back with yield plus a share of the forfeit pool. Miss it
            and it funds everyone who didn&rsquo;t.
          </p>
        </form>
      </div>
    </Shell>
  );
}
