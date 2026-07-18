import {Hono} from "hono";
import {cors} from "hono/cors";
import type {Address} from "viem";
import {
  bearer,
  bindingMessage,
  githubLoginFromCode,
  issueSession,
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

app.use("/*", cors({origin: (o) => o ?? "*", credentials: true}));

app.get("/", (c) =>
  c.json({
    service: "tamon-attestation",
    verifier: verifierAddress(),
    contract: tamonAddress(),
    chainId: 10143,
    trust: "Attestations are signed by a single hot key. Trust-minimized, not trustless.",
  }),
);

/// Step 1 of binding: the frontend asks what the wallet must sign.
app.get("/auth/message", (c) => {
  const githubLogin = c.req.query("githubLogin");
  const nonce = c.req.query("nonce");
  if (!githubLogin || !nonce) return c.json({error: "githubLogin and nonce required"}, 400);
  return c.json({message: bindingMessage(githubLogin, nonce)});
});

/// Step 2: GitHub sends the user back here. `state` carries the wallet address and nonce so the
/// binding can be completed without any server-side session store.
app.get("/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.json({error: "code and state required"}, 400);

  try {
    const githubLogin = await githubLoginFromCode(code);
    const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const url = new URL("/link", frontend);
    url.searchParams.set("githubLogin", githubLogin);
    url.searchParams.set("state", state);
    return c.redirect(url.toString());
  } catch (e) {
    return c.json({error: String(e)}, 502);
  }
});

/// Step 3: the wallet's signature over the binding message is exchanged for a session.
app.post("/auth/session", async (c) => {
  const body = await c.req.json<{
    githubLogin?: string;
    wallet?: Address;
    nonce?: string;
    signature?: `0x${string}`;
  }>();

  const {githubLogin, wallet, nonce, signature} = body;
  if (!githubLogin || !wallet || !nonce || !signature) {
    return c.json({error: "githubLogin, wallet, nonce and signature required"}, 400);
  }

  const ok = await verifyWalletBinding(wallet, githubLogin, nonce, signature);
  if (!ok) return c.json({error: "signature does not match wallet"}, 401);

  return c.json({token: await issueSession({githubLogin, wallet})});
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
