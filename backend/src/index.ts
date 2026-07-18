import {Hono} from "hono";
import {cors} from "hono/cors";
import type {Address} from "viem";
import {
  bearer,
  bindingMessage,
  githubLoginFromCode,
  issueLinkToken,
  issueSession,
  readLinkToken,
  readSession,
  verifyWalletBinding,
} from "./auth.js";
import {countCommits, ownsRepo} from "./github.js";
import {
  publicClient,
  signAttestation,
  STATE_ACTIVE,
  TAMON_ABI,
  tamonAddress,
  verifierAddress,
} from "./sign.js";

const app = new Hono();

/// Strict allowlist. Reflecting the caller's origin back while allowing credentials would let
/// any site call this API with the browser's ambient auth. Sessions travel as Bearer tokens
/// rather than cookies, so credentials are not needed at all.
const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:3000",
  "http://localhost:3000",
];
app.use("/*", cors({origin: (o) => (o && allowedOrigins.includes(o) ? o : null), credentials: false}));

/// Reports which configuration is missing instead of throwing. A bare 500 here is the worst
/// possible signal during a demo — it looks like the service is broken when it is only unset.
app.get("/", (c) => {
  const missing = (
    ["VERIFIER_PRIVATE_KEY", "JWT_SECRET", "TAMON_ADDRESS", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const
  ).filter((k) => !process.env[k]);

  let verifier: string | null = null;
  try {
    verifier = verifierAddress();
  } catch {
    /* reported via `missing` below */
  }

  return c.json({
    service: "tamon-attestation",
    ready: missing.length === 0,
    missingConfig: missing,
    verifier,
    contract: process.env.TAMON_ADDRESS ?? null,
    chainId: 10143,
    trust: "Attestations are signed by a single hot key. Trust-minimized, not trustless.",
  });
});

/// Step 1 of binding: the frontend asks what the wallet must sign.
app.get("/auth/message", (c) => {
  const githubLogin = c.req.query("githubLogin");
  const nonce = c.req.query("nonce");
  if (!githubLogin || !nonce) return c.json({error: "githubLogin and nonce required"}, 400);
  return c.json({message: bindingMessage(githubLogin, nonce)});
});

/// Step 2: GitHub sends the user back here. `state` carries the nonce the frontend generated
/// before the redirect.
///
/// The login is returned to the frontend inside a server-signed link token, never as a plain
/// value. That is the whole point: a raw login in a URL parameter would just come straight back
/// in the next request, and the client could substitute anyone's name.
app.get("/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const nonce = c.req.query("state");
  if (!code || !nonce) return c.json({error: "code and state required"}, 400);

  try {
    const githubLogin = await githubLoginFromCode(code);
    const linkToken = await issueLinkToken(githubLogin, nonce);

    const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const url = new URL("/link", frontend);
    url.searchParams.set("linkToken", linkToken);
    return c.redirect(url.toString());
  } catch (e) {
    return c.json({error: String(e)}, 502);
  }
});

/// Step 3: exchange the link token plus a wallet signature for a session.
///
/// Both halves are now proven rather than asserted. The GitHub half comes from the link token,
/// which only this server can mint and only after a real OAuth exchange. The wallet half comes
/// from a signature over a message containing that same login and nonce.
///
/// Taking githubLogin from the request body instead would let anyone sign
/// bindingMessage("someone-else", nonce) with their own wallet and be issued a session as that
/// person — and then settle against that person's repositories.
app.post("/auth/session", async (c) => {
  const body = await c.req.json<{
    linkToken?: string;
    wallet?: Address;
    signature?: `0x${string}`;
  }>();

  const {linkToken, wallet, signature} = body;
  if (!linkToken || !wallet || !signature) {
    return c.json({error: "linkToken, wallet and signature required"}, 400);
  }

  const link = await readLinkToken(linkToken);
  if (!link) return c.json({error: "link token invalid or expired"}, 401);

  const ok = await verifyWalletBinding(wallet, link.githubLogin, link.nonce, signature);
  if (!ok) return c.json({error: "signature does not match wallet"}, 401);

  return c.json({
    token: await issueSession({githubLogin: link.githubLogin, wallet}),
    githubLogin: link.githubLogin,
  });
});

/// The attestation endpoint.
///
/// Note what is NOT trusted from the request body: the repository. It is read from the chain,
/// because that is the only copy the user could not have tampered with after committing. The
/// body supplies a tokenId and nothing else that matters.
app.post("/attest", async (c) => {
  const session = await readSession(bearer(c.req.header("Authorization")));
  if (!session) return c.json({error: "no valid session"}, 401);

  const body = await c.req.json<{tokenId?: string}>();
  if (!body.tokenId) return c.json({error: "tokenId required"}, 400);
  const tokenId = BigInt(body.tokenId);

  const address = tamonAddress();

  let commitment;
  let owner: Address;
  try {
    [commitment, owner] = await Promise.all([
      publicClient.readContract({address, abi: TAMON_ABI, functionName: "getCommitment", args: [tokenId]}),
      publicClient.readContract({address, abi: TAMON_ABI, functionName: "ownerOf", args: [tokenId]}),
    ]);
  } catch {
    return c.json({error: "unknown token"}, 404);
  }

  if (commitment.state !== STATE_ACTIVE) return c.json({error: "commitment is not active"}, 409);

  // The session's wallet must be the one that owns the stone. Otherwise anyone with any valid
  // session could farm attestations for other people's commitments.
  if (owner.toLowerCase() !== session.wallet.toLowerCase()) {
    return c.json({error: "session wallet does not own this commitment"}, 403);
  }

  if (!ownsRepo(commitment.repo, session.githubLogin)) {
    return c.json({error: `${commitment.repo} is not owned by ${session.githubLogin}`}, 403);
  }

  const deadline = Number(commitment.deadline);
  if (Math.floor(Date.now() / 1000) > deadline) {
    return c.json({error: "deadline has passed"}, 409);
  }

  let achieved: number;
  let headSha: string | null;
  try {
    ({achieved, headSha} = await countCommits(
      commitment.repo,
      session.githubLogin,
      new Date(Number(commitment.start) * 1000),
      commitment.target,
    ));
  } catch (e) {
    // Rate limits and outages are retryable; say so rather than looking like a refusal to sign.
    return c.json({error: String(e), retryable: true}, 503);
  }

  if (achieved < commitment.target) {
    return c.json({
      signed: false,
      achieved,
      target: commitment.target,
      reason: `${achieved}/${commitment.target} non-empty commits so far`,
    });
  }

  const {signature, expiry} = await signAttestation({tokenId, owner, achieved});
  return c.json({signed: true, achieved, target: commitment.target, expiry, signature, headSha});
});

export default app;
