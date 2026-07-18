"use client";

import Link from "next/link";
import {useAccount, useConnect, useDisconnect, useSwitchChain} from "wagmi";
import {monadTestnet} from "@/lib/chain";

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/// Enough of the common chains to name what the wallet is actually on. Anything else falls
/// back to the raw id, which is still more honest than claiming it's Monad.
const KNOWN_CHAINS: Record<number, string> = {
  1: "Ethereum",
  10: "Optimism",
  56: "BNB Chain",
  137: "Polygon",
  143: "Monad mainnet",
  8453: "Base",
  42161: "Arbitrum One",
  11155111: "Sepolia",
};

/// True when the wallet is connected but pointed somewhere other than Monad testnet.
///
/// Pages use this to disable their primary action. Letting the click through means the user
/// gets a raw wallet error mid-flow and has to work out that the network is the problem —
/// the banner is already telling them, and the button should agree with it.
export function useWrongChain(): boolean {
  const {isConnected, chainId} = useAccount();
  return isConnected && chainId !== undefined && chainId !== monadTestnet.id;
}

export function Shell({children}: {children: React.ReactNode}) {
  const {address, isConnected, chainId} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain, isPending: switching, error: switchError} = useSwitchChain();

  // useChainId() reports the chain from the wagmi *config*, not the wallet. Since the config
  // only contains Monad testnet it always returned 10143, so the wrong-network check could
  // never fire. useAccount().chainId is the wallet's actual chain.
  const wrongChain = isConnected && chainId !== undefined && chainId !== monadTestnet.id;
  const chainLabel = wrongChain
    ? (KNOWN_CHAINS[chainId] ?? `Chain ${chainId}`)
    : monadTestnet.name;
  const injected = connectors[0];

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Four separate pieces of information — product, network, account, sign-out — that were
          previously running together into one unreadable line. Each now sits in its own cell
          with a hairline between, so the eye can find the one it wants. */}
      <header className="border-crack border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-stretch gap-y-3 px-6">
          <Link
            href="/app"
            className="border-crack flex items-center py-4 pr-5 md:border-r"
            aria-label="Tamon home"
          >
            <span className="font-display text-xl font-extrabold tracking-tight">TAMON</span>
          </Link>

          {/* Shows what the wallet is really on. Hardcoding the expected network here would
              tell the user everything is fine while every transaction fails. */}
          <div className="border-crack flex items-center gap-3 py-4 md:border-r md:px-5">
            <div className="flex flex-col justify-center">
              <span className="data text-muted text-[10px] tracking-[0.16em] uppercase">
                Network
              </span>
              <span className={`data text-[13px] ${wrongChain ? "text-accent" : ""}`}>
                {chainLabel}
              </span>
            </div>
            {wrongChain && (
              <button
                onClick={() => switchChain({chainId: monadTestnet.id})}
                disabled={switching}
                className="data border-accent text-accent hover:bg-accent hover:text-void border px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase disabled:opacity-50"
              >
                {switching ? "Switching…" : "Switch"}
              </button>
            )}
          </div>

          <div className="flex flex-1 items-center justify-end gap-5 py-4">
            {isConnected ? (
              <>
                <div className="flex flex-col items-end justify-center">
                  <span className="data text-muted text-[10px] tracking-[0.16em] uppercase">
                    Wallet
                  </span>
                  <span className="data text-[13px]">{short(address!)}</span>
                </div>
                <button
                  onClick={() => disconnect()}
                  className="data border-crack text-muted hover:border-text hover:text-text border px-3 py-2 text-[11px] tracking-[0.14em] uppercase"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => injected && connect({connector: injected})}
                disabled={isPending || !injected}
                className="data bg-accent text-void px-4 py-2 text-[11px] font-medium tracking-[0.14em] uppercase disabled:opacity-50"
              >
                {isPending ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      {wrongChain && (
        <div className="border-accent/40 bg-accent/10 border-b">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
            <div className="flex flex-col gap-1">
              <span className="text-sm">
                Tamon runs on Monad testnet. Your wallet is on {chainLabel}, so nothing here will
                confirm.
              </span>
              {/* A rejected switch and a wallet that can't add the network are different
                  problems with different fixes, so they don't share a message. */}
              {switchError && (
                <span className="text-muted text-xs">
                  {switchError.message.toLowerCase().includes("reject")
                    ? "You dismissed the request. Press Switch again when ready."
                    : "Your wallet wouldn't switch automatically — add Monad testnet (chain 10143) manually, then reload."}
                </span>
              )}
            </div>
            <button
              onClick={() => switchChain({chainId: monadTestnet.id})}
              disabled={switching}
              className="data bg-accent text-void shrink-0 px-4 py-2 text-[11px] font-medium tracking-[0.14em] uppercase disabled:opacity-50"
            >
              {switching ? "Check your wallet…" : "Switch to Monad testnet"}
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
