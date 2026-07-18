import {SignJWT, jwtVerify} from "jose";
import {verifyMessage, type Address} from "viem";

/// A session binds one GitHub login to one wallet address. This is the pairing that stops a
/// user from pointing at somebody else's repository, so both halves have to be proven:
/// the GitHub half by OAuth, the wallet half by a signature.
export interface Session {
  githubLogin: string;
  wallet: Address;
}

const ISSUER = "tamon";
const TTL = "12h";
/// Separate audience so a link token can never be replayed as a session token.
const LINK_AUDIENCE = "tamon:link";

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET unset");
  return new TextEncoder().encode(s);
}

/// The message the wallet must sign to prove control of the address.
/// Includes the GitHub login so a signature captured for one account cannot be replayed to
/// bind a different one, and a nonce so it cannot be replayed at all.
export function bindingMessage(githubLogin: string, nonce: string): string {
  return [
    "Tamon wants to link your GitHub account to this wallet.",
    "",
    `GitHub: ${githubLogin}`,
    `Nonce: ${nonce}`,
    "",
    "Signing costs nothing and grants no spending permission.",
  ].join("\n");
}

export async function verifyWalletBinding(
  wallet: Address,
  githubLogin: string,
  nonce: string,
  signature: `0x${string}`,
): Promise<boolean> {
  return verifyMessage({
    address: wallet,
    message: bindingMessage(githubLogin, nonce),
    signature,
  });
}

/// A link token is the server's own attestation that it just completed an OAuth exchange for
/// this login, carrying the nonce that flow started with.
///
/// This exists because a wallet signature alone proves only that the wallet holder CONSENTED to
/// bind to some login — never that they own it. Without a server-signed carrier, anyone could
/// sign bindingMessage("someone-else", nonce) with their own wallet and be issued a session as
/// that person, then settle against that person's repositories. The login has to travel back
/// from the callback in something the client cannot forge.
///
/// Short-lived: it only has to survive the redirect back to the frontend and one signature.
export async function issueLinkToken(githubLogin: string, nonce: string): Promise<string> {
  return new SignJWT({githubLogin, nonce})
    .setProtectedHeader({alg: "HS256"})
    .setIssuer(ISSUER)
    .setAudience(LINK_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret());
}

export async function readLinkToken(
  token: string | undefined,
): Promise<{githubLogin: string; nonce: string} | null> {
  if (!token) return null;
  try {
    const {payload} = await jwtVerify(token, secret(), {issuer: ISSUER, audience: LINK_AUDIENCE});
    const githubLogin = payload.githubLogin;
    const nonce = payload.nonce;
    if (typeof githubLogin !== "string" || typeof nonce !== "string") return null;
    return {githubLogin, nonce};
  } catch {
    return null;
  }
}

export async function issueSession(session: Session): Promise<string> {
  return new SignJWT({githubLogin: session.githubLogin, wallet: session.wallet})
    .setProtectedHeader({alg: "HS256"})
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secret());
}

/// Returns null rather than throwing so callers answer with 401 instead of 500.
export async function readSession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const {payload} = await jwtVerify(token, secret(), {issuer: ISSUER});
    const githubLogin = payload.githubLogin;
    const wallet = payload.wallet;
    if (typeof githubLogin !== "string" || typeof wallet !== "string") return null;
    return {githubLogin, wallet: wallet as Address};
  } catch {
    return null;
  }
}

export function bearer(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7);
}

/// Exchange an OAuth code for the authenticated user's login.
export async function githubLoginFromCode(code: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {"Content-Type": "application/json", Accept: "application/json"},
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const token = (await res.json()) as {access_token?: string; error?: string};
  if (!token.access_token) throw new Error(`oauth exchange failed: ${token.error ?? "unknown"}`);

  const me = await fetch("https://api.github.com/user", {
    headers: {Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json"},
  });
  if (!me.ok) throw new Error(`github /user failed: ${me.status}`);
  const user = (await me.json()) as {login?: string};
  if (!user.login) throw new Error("github /user returned no login");
  return user.login;
}
