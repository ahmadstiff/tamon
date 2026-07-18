"use client";

import {BACKEND_URL} from "./tamon";

const TOKEN_KEY = "tamon.session";
const NONCE_KEY = "tamon.nonce";
const RETURN_KEY = "tamon.return";

export interface Session {
  token: string;
  githubLogin: string;
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NONCE_KEY);
}

/// Start the OAuth round trip.
///
/// The nonce goes out in `state` and is kept locally so the signature we produce afterwards is
/// tied to this specific attempt. GitHub echoes `state` back to the backend, which mints a
/// signed link token carrying the login and that same nonce.
export function beginGithubLink(clientId: string) {
  const nonce = crypto.randomUUID();
  localStorage.setItem(NONCE_KEY, nonce);
  // Linking is something you do mid-claim, so the round trip has to end where it started.
  // Dropping the user on the home page means finding their stone again by hand.
  localStorage.setItem(RETURN_KEY, window.location.pathname);

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${BACKEND_URL}/auth/github/callback`);
  url.searchParams.set("scope", "read:user");
  url.searchParams.set("state", nonce);
  window.location.href = url.toString();
}

/// Ask the backend what this wallet has to sign. The message is server-authored so it always
/// matches what the backend will verify against.
export async function fetchBindingMessage(githubLogin: string, nonce: string): Promise<string> {
  const url = new URL("/auth/message", BACKEND_URL);
  url.searchParams.set("githubLogin", githubLogin);
  url.searchParams.set("nonce", nonce);

  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not reach the attestation service.");
  const body = (await res.json()) as {message: string};
  return body.message;
}

/// Exchange the link token plus a wallet signature for a session.
///
/// Note what is NOT sent: the GitHub login. It travels inside `linkToken`, which only the
/// backend can mint and only after a real OAuth exchange. Sending the login from here would
/// let anyone sign a binding message naming someone else and be issued a session as them.
export async function exchangeForSession(
  linkToken: string,
  wallet: string,
  signature: string,
): Promise<Session> {
  const res = await fetch(new URL("/auth/session", BACKEND_URL), {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({linkToken, wallet, signature}),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {error?: string};
    throw new Error(body.error ?? "Could not complete the link.");
  }

  const body = (await res.json()) as {token: string; githubLogin: string};
  return {token: body.token, githubLogin: body.githubLogin};
}

export function readNonce(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(NONCE_KEY);
}

/// Where the user was when they started linking. Falls back to the dashboard.
export function readReturnPath(): string {
  if (typeof window === "undefined") return "/app";
  const p = localStorage.getItem(RETURN_KEY);
  localStorage.removeItem(RETURN_KEY);
  // Only same-origin paths — never trust this to redirect off-site.
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/app";
}

/// Decode the login out of the link token so the binding message can be built before the
/// session exists. The signature is not verified here — the backend does that, and this value
/// is only used to render text and construct the message it will re-derive itself.
export function loginFromLinkToken(linkToken: string): string | null {
  try {
    const payload = linkToken.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as {
      githubLogin?: string;
    };
    return json.githubLogin ?? null;
  } catch {
    return null;
  }
}
