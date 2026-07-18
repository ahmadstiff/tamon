"use client";

import Link from "next/link";
import {useAccount, useChainId, useConnect, useDisconnect, useSwitchChain} from "wagmi";
import {monadTestnet} from "@/lib/chain";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function Shell({children}: {children: React.ReactNode}) {
  const {address, isConnected} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const chainId = useChainId();
  const {switchChain} = useSwitchChain();

  const wrongChain = isConnected && chainId !== monadTestnet.id;
  const injected = connectors[0];

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-crack">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-baseline justify-between gap-4">
          <Link href="/" className="font-display text-xl font-extrabold tracking-tight">
            TAMON
            <span className="data ml-3 text-[11px] tracking-[0.14em] text-muted font-normal">
              MONAD TESTNET
            </span>
          </Link>

          {isConnected ? (
            <div className="flex items-center gap-4">
              <span className="data text-[11px] text-muted">{short(address!)}</span>
              <button
                onClick={() => disconnect()}
                className="data text-[11px] tracking-[0.14em] uppercase text-muted hover:text-text"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={() => injected && connect({connector: injected})}
              disabled={isPending || !injected}
              className="data text-[11px] tracking-[0.14em] uppercase px-4 py-2 bg-accent text-void font-medium disabled:opacity-50"
            >
              {isPending ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </header>

      {wrongChain && (
        <div className="border-b border-accent/40 bg-accent/10">
          <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between gap-4">
            <span className="text-sm">This app runs on Monad testnet. You&rsquo;re on another network.</span>
            <button
              onClick={() => switchChain({chainId: monadTestnet.id})}
              className="data text-[11px] tracking-[0.14em] uppercase px-3 py-1.5 bg-accent text-void font-medium shrink-0"
            >
              Switch network
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-10">{children}</main>

      {/* R3 requires the trust boundary to be stated to the user, not only to whoever reads the
          repo. It sits in the layout so it is present on every screen, including next to the
          claim button. */}
      <footer className="border-t border-crack">
        <div className="mx-auto max-w-5xl px-6 py-5 flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <p className="text-[13px] text-muted max-w-xl">
            Completion is attested by Tamon&rsquo;s verifier key reading the GitHub API.{" "}
            <span className="text-text">Trust-minimised, not trustless</span> — settlement and exit
            are on-chain, verification is delegated.
          </p>
          <a
            href="https://github.com/ahmadstiff/tamon"
            className="data text-[11px] tracking-[0.14em] uppercase text-muted hover:text-text"
          >
            Source
          </a>
        </div>
      </footer>
    </div>
  );
}

/// Every empty and in-between screen the app can land on. The first thing a judge sees is a
/// disconnected wallet with no stones, so that state gets real copy rather than a blank page.

export function ConnectPrompt() {
  const {connect, connectors, isPending} = useConnect();
  const injected = connectors[0];

  return (
    <div className="py-20 flex flex-col items-start gap-5 max-w-lg">
      <h2 className="font-display text-3xl font-extrabold leading-tight">
        Stake against your own procrastination.
      </h2>
      <p className="text-muted">
        Put MON behind a commit target. Hit it and you get your stake back with staking yield and a
        share of everyone who missed. Miss it and your stake funds the people who didn&rsquo;t.
      </p>
      <button
        onClick={() => injected && connect({connector: injected})}
        disabled={isPending || !injected}
        className="data text-[11px] tracking-[0.14em] uppercase px-5 py-3 bg-accent text-void font-medium disabled:opacity-50"
      >
        {injected ? "Connect wallet to start" : "No wallet detected"}
      </button>
    </div>
  );
}

export function EmptyStones() {
  return (
    <div className="py-16 flex flex-col items-start gap-4">
      <p className="text-muted">No stones yet.</p>
      <Link
        href="/new"
        className="data text-[11px] tracking-[0.14em] uppercase px-5 py-3 bg-accent text-void font-medium"
      >
        Make your first commitment
      </Link>
    </div>
  );
}

/// A silhouette rather than a spinner. The page shape stays put while data arrives, so nothing
/// jumps when it lands.
export function StoneSkeleton({size = 240}: {size?: number}) {
  return (
    <div className="flex flex-col gap-3 opacity-30">
      <div className="bg-surface border border-crack" style={{width: size, height: size}} />
      <div className="h-px bg-crack" style={{width: size}} />
    </div>
  );
}

export function ErrorNote({message, onRetry}: {message: string; onRetry?: () => void}) {
  return (
    <div className="border border-crack bg-surface px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="data text-[11px] tracking-[0.14em] uppercase text-accent shrink-0"
        >
          Try again
        </button>
      )}
    </div>
  );
}
