# Tamon — as built

What actually shipped, and where it diverged from the plan. The plan
(`docs/plans/2026-07-18-001-feat-tamon-commitment-staking-plan.md`) is a decision record from
before implementation and is deliberately left as written; this file is the one to trust for
paths, addresses, and behaviour.

---

## Live

| | |
|---|---|
| App | https://tamon-app.vercel.app |
| Backend | https://backend-inky-six-98.vercel.app |
| Contract | `0x770d9f4f7D667c6663BC74b7b639b923449DaB6b` ([explorer](https://testnet.monadvision.com/address/0x770d9f4f7D667c6663BC74b7b639b923449DaB6b)) |
| Verifier | `0xe99Ce7560ff74F9d07d2e7b99eFbeaF888E874Ab` |
| shMON vault | `0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9` (FastLane, ERC-7535) |
| Chain | Monad testnet, 10143 |
| Repo | https://github.com/ahmadstiff/tamon |

Contract tests: 54. Frontend tests: 67. Runtime bytecode 17,170 bytes (Monad's ceiling is 128KB).

---

## Routes

The plan put the dashboard at `/`. A landing page was added later, so everything moved down one.

| Route | File | What it is |
|---|---|---|
| `/` | `frontend/src/app/page.tsx` | Landing — live stone hero, how-it-works |
| `/app` | `frontend/src/app/app/page.tsx` | Dashboard, grouped by outcome |
| `/new` | `frontend/src/app/new/page.tsx` | Create a commitment |
| `/stone/[id]` | `frontend/src/app/stone/[id]/page.tsx` | One specimen; claim, withdraw, reap |
| `/link` | `frontend/src/app/link/page.tsx` | GitHub↔wallet binding, step 3 |

Paths are under `src/` — the plan wrote `frontend/app/…`, the scaffold used `--src-dir`.

---

## Palette — assets won, the plan lost

The plan proposed `#0B0B0D` / `#6E6A63` / `#C8622A`. The on-chain SVG assets were authored
first with different values, and since they are **deployed and immutable**, the UI matched them
rather than the other way round.

| Token | Value | Used for |
|---|---|---|
| `--color-void` | `#0e1014` | page |
| `--color-surface` | `#141417` | raised surfaces |
| `--color-stone` | `#6e7480` | stone fill |
| `--color-crack` | `#262a31` | hairlines, borders |
| `--color-accent` | `#e8b23a` | the single accent |
| `--color-text` | `#f2f0ec` | primary text |
| `--color-muted` | `#8a8f99` | secondary text |

Type: **Archivo** (display/body), **JetBrains Mono** (all numerals). `border-radius: 0`
everywhere. Zero gradients.

If the palette ever needs to change, `assets/tamon-assets.json` and `contract/src/TamonArt.sol`
are the source — the CSS follows them, not the reverse. TamonArt is deployed, so a change means
a redeploy.

---

## Not in the plan, added during the build

- **Landing page** (`/`) with a live stone hero read from the contract.
- **React Bits components**, vendored via the shadcn registry in `frontend/components.json`:
  `PillNav` (nav), `Galaxy` (background), `SpecularButton` (CTA). All three were patched after
  install — see "Vendored component fixes" below.
- **GSAP** (`gsap`, `@gsap/react`) for the erosion tween and crack propagation.
- **Dashboard grouping** — at risk / settled / forfeited tabs, rather than one mixed grid.
- **Wrong-network handling** — the plan assumed it worked; it never fired. See below.
- **DOMPurify** on the injected SVG.

---

## Behaviour worth knowing before changing anything

**`achieved` is written on-chain only at settlement.** It reads `0` however much has been
pushed. The UI labels it "recorded on-chain at settlement" for exactly this reason; removing
that label makes the app look broken.

**Commits only count after the commitment exists.** The contract stores `start`; the backend
queries `since=start`. Pushing first and committing second yields zero. This is the single most
common way a test run "fails" when nothing is wrong.

**Empty commits are rejected.** `backend/src/github.ts` checks `stats.total > 0` per commit.

**The repo must be public.** The backend calls GitHub unauthenticated — private repos 404, and
the rate limit is 60/hour.

**`useChainId()` reports the config's chain, not the wallet's.** With a single-chain config it
always returned 10143, so the wrong-network check was structurally incapable of firing. Use
`useAccount().chainId`.

**Vercel alias.** `vercel alias set` pins to one deployment. The project is now configured so
`tamon-app.vercel.app` follows production automatically — if that config is ever lost, a deploy
will look successful while serving stale content, and status codes won't reveal it.

**Stone sizing.** `size` is a max-width, not a width. A fixed width was silently clipped by the
landing wrapper's `overflow-hidden`, so a scroll-width check reported no overflow while the
artwork was cropped.

---

## Vendored component fixes

The shadcn model copies source into the repo, which is what made these possible:

| Component | Problem | Fix |
|---|---|---|
| `PillNav` | Imported `react-router-dom` | Repointed at `next/link`; router dependency removed, not installed |
| `PillNav` | `to=` prop | `href=` |
| `SpecularButton` | Strict-mode type error — a null narrowing that doesn't survive an intermediate boolean | Repeated the check; behaviour unchanged |
| `Galaxy` | `prefer-const` false positive — the binding must exist before the closure that reads it | Suppressed with the reason |

**Galaxy is tuned, not default.** `saturation: 0`, `density: 0.6`, `glowIntensity: 0.15`,
40% opacity. At those values it reads as mineral dust rather than a starfield, which is what
lets it sit under a geological subject without becoming a space theme. Raising saturation
breaks the single-accent rule.

---

## API contract

Changed after the auth-bypass fix. `/auth/session` no longer accepts `githubLogin` from the
caller — it travels inside a server-signed `linkToken`.

```
GET  /                       → { ready, missingConfig, verifier, contract, chainId }
GET  /auth/message           ?githubLogin&nonce → { message }
GET  /auth/github/callback   ?code&state → redirects to FRONTEND_URL/link?linkToken=…
POST /auth/session           { linkToken, wallet, signature } → { token, githubLogin }
POST /attest                 { tokenId } + Bearer → { signed, achieved, target, signature?, expiry? }
```

`/attest` reads the repo from the chain, never from the request body.

---

## Environment

**backend** (Vercel production): `VERIFIER_PRIVATE_KEY`, `JWT_SECRET`, `TAMON_ADDRESS`,
`RPC_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `FRONTEND_URL`.

**frontend**: `NEXT_PUBLIC_TAMON_ADDRESS`, `NEXT_PUBLIC_BACKEND_URL`,
`NEXT_PUBLIC_GITHUB_CLIENT_ID`.

`FRONTEND_URL` feeds both the CORS allowlist and the post-OAuth redirect. Changing the frontend
domain without updating it breaks login with a CORS error that looks like a backend outage.

The verifier key lives in the encrypted keystore at `~/.monskills/keystore` and in Vercel's
secret store. It is never in the repo.

---

## Commands

```bash
# contract — fork tests hit real shMON
cd contract && forge test --fork-url https://testnet-rpc.monad.xyz

# frontend — bun, not npm/pnpm
cd frontend && bun dev
cd frontend && bun run build && bun run lint && bun run test

# backend — pnpm
cd backend && pnpm dev && pnpm typecheck

# deploy (project is linked; alias follows production)
cd frontend && vercel deploy --prod --scope ahmadzzzs-projects
cd backend  && vercel deploy --prod --scope ahmadzzzs-projects
```

---

## Verified end to end

Token #3 (`ahmadstiff/tamon-landing`, target 2) went the whole way: commit → GitHub link →
attestation → `settle` → `withdraw`. On-chain state is `Succeeded`, `achieved 2/2`,
`completedCount = 1`, `claimableShares = 0`.

Solvency reconciles exactly: the contract holds `17034715759794230` wei of shMON against
tokens #1 and #2 still active at the same total. Surplus zero, deficit zero.

**Still untested:** the failure branch. Tokens #1 and #2 are past their deadlines and still
`Active` — opening either one triggers reap-on-view and shatters it.
