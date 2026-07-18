"use client";

import {useRouter, useSearchParams} from "next/navigation";
import {Suspense, useState} from "react";
import {useAccount, useSignMessage} from "wagmi";
import {ConnectPrompt, ErrorNote, Shell} from "@/components/Shell";
import {
  exchangeForSession,
  fetchBindingMessage,
  loginFromLinkToken,
  readNonce,
  readReturnPath,
  saveSession,
} from "@/lib/session";

/// Step three of the binding: GitHub has already been proven, and this is where the wallet
/// proves its half. Both halves have to be real — one alone would let someone claim an account
/// they don't own, or a repository they have nothing to do with.
function LinkInner() {
  const router = useRouter();
  const params = useSearchParams();
  const {address, isConnected} = useAccount();
  const {signMessageAsync} = useSignMessage();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const linkToken = params.get("linkToken");
  const githubLogin = linkToken ? loginFromLinkToken(linkToken) : null;

  async function complete() {
    if (!linkToken || !githubLogin || !address) return;
    const nonce = readNonce();
    if (!nonce) {
      setError("This link attempt expired. Start again from the stone you were claiming.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const message = await fetchBindingMessage(githubLogin, nonce);
      const signature = await signMessageAsync({message});
      const session = await exchangeForSession(linkToken, address, signature);
      saveSession(session);
      router.push(readReturnPath());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the link.");
    } finally {
      setBusy(false);
    }
  }

  if (!isConnected) {
    return <ConnectPrompt />;
  }

  if (!linkToken || !githubLogin) {
    return (
      <ErrorNote message="That link is missing or expired. Start again from the stone you were claiming." />
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="label">Link accounts</span>
        <h1 className="font-display text-2xl font-extrabold">
          Sign to link <span className="text-accent">{githubLogin}</span>
        </h1>
      </div>

      <p className="text-muted">
        This proves the wallet and the GitHub account belong to the same person. Signing costs
        nothing and grants no spending permission.
      </p>

      {error && <ErrorNote message={error} />}

      <button
        onClick={complete}
        disabled={busy}
        className="data bg-accent text-void self-start px-5 py-3 text-[11px] font-medium tracking-[0.14em] uppercase disabled:opacity-50"
      >
        {busy ? "Waiting for signature…" : "Sign and link"}
      </button>
    </div>
  );
}

export default function LinkPage() {
  return (
    <Shell>
      <Suspense fallback={null}>
        <LinkInner />
      </Suspense>
    </Shell>
  );
}
