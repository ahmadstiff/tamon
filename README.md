# Tamon

I have eleven repositories with a first commit and nothing after it. Not one of them failed because the idea was bad or because I couldn't write the code. They failed on a Tuesday, quietly, when I decided I'd pick it back up tomorrow — and nothing anywhere in the world registered that I hadn't. Intent is abundant. Consequence is scarce. A to-do app never fixed this for me because ticking a box costs nothing, and skipping the box costs exactly as much.

So I made skipping cost something.

Tamon lets me stake MON against a GitHub commit target. Hit it and I get my principal back, plus the staking yield it earned while locked, plus a share of everyone who missed. Miss it and my stake funds the people who didn't.

## The one idea

The three layers are not three features. They are one argument:

**Staked money should keep working** (the stake sits in shMON liquid staking, not idle escrow). **Consequence should be objective** (GitHub commits, not a self-report). **And consequence should be felt *before* the deadline arrives** — that is the stone.

Every commitment mints a soulbound ERC-721 whose artwork is rendered entirely on-chain and weathers as the deadline approaches. Intact, then worn, then cracked, then shattered or crystallized. It changes with no transaction, no metadata server, and no IPFS — the image is a pure function of `block.timestamp`, so a caller that re-reads `tokenURI` sees a different picture than it did a minute ago.

The weathering stone is the only part of this system that speaks to you while you are procrastinating. Everything else only speaks at the deadline, which is too late to change anything.

## How it works

| Step | What happens |
|---|---|
| `commit(repo, target, duration)` | Stake MON. It deposits into shMON in the same transaction and earns yield for the whole period. A soulbound stone is minted. |
| *time passes* | The stone weathers: intact under 50% elapsed, worn at 50–80%, cracked at 80%+. No transaction involved. |
| `settle(tokenId, achieved, expiry, sig)` | Backend queries GitHub, and if the target is met, signs an EIP-712 attestation. Permissionless to submit — payout always goes to `ownerOf(tokenId)`. Stone crystallizes. |
| `reap(tokenId)` | Anyone can sweep an expired commitment. Its principal and accrued yield flow into the prize pool. Stone shatters. |
| `withdraw()` / `exitInKind()` | Redeem settled shares for native MON, or take the shMON itself. |

The prize pool uses a cumulative reward-per-weight accumulator (MasterChef pattern): two globals, one field per commitment, no epochs, no loops. Solvent by construction — every division floors in the contract's favour, and the remainder is carried in `undistributed`.

**Prize weight is time-scaled**: `weight = shares * duration / MAX_DURATION`. `shares` is principal; `weight` is the claim on the pool. They are never interchanged.

## Deployment

| | |
|---|---|
| **App** | **https://frontend-alpha-lovat-tnfbt64nem.vercel.app** |
| Contract | `0x770d9f4f7D667c6663BC74b7b639b923449DaB6b` |
| Chain | Monad testnet (10143) |
| Explorer | https://testnet.monadvision.com/address/0x770d9f4f7D667c6663BC74b7b639b923449DaB6b |
| Backend | https://backend-inky-six-98.vercel.app |
| Verifier key | `0xe99Ce7560ff74F9d07d2e7b99eFbeaF888E874Ab` |
| shMON vault | `0x282BdDFF5e58793AcAb65438b257Dbd15A8745C9` (FastLane, ERC-7535) |

54 contract tests passing, 0 lint warnings, 17,170 bytes of runtime bytecode (Monad's limit is 128KB — the familiar 24KB ceiling does not apply here).

## Running locally

```bash
# Contract — fork tests hit real shMON on Monad testnet
cd contract && forge test --fork-url https://testnet-rpc.monad.xyz

# Backend — attestation service
cd backend && cp .env.example .env   # fill VERIFIER_PRIVATE_KEY, JWT_SECRET, GitHub OAuth
pnpm dev

# Frontend
cd frontend && cp .env.example .env.local
bun dev
```

Stack: Foundry + Solidity 0.8.28 + OpenZeppelin v5.1.0 · Hono + viem + jose on Vercel · Next.js 15 + React 19 + wagmi v3 + Tailwind 4 + GSAP.

## Design decisions

**No treasury.** The 10% slash fee is removed from `dist` and credited to nobody — it becomes shares permanently locked in the contract. Routing it to a developer-controlled address would have identical deterrence and completely different optics. "Forfeited stake flows to other users, not to a house" is the line that separates this from gambling, and a rake would erase it.

**Accumulator, not epochs.** Bucketing a permissionless event stream into epochs is unfixable, not merely awkward. Assign a forfeiture by the commitment's deadline and it lands in an already-closed epoch — either insolvency or permanently stranded funds. Assign it by reap time and the reaper picks the bucket, reaping exactly when their own share peaks. There is no third option; it is inherent to slicing a continuous permissionless stream into discrete windows.

**Prize weight is time-scaled.** Deadlines are public on-chain and `reap` is permissionless. Under capital-only weighting, an attacker commits large with the 60-second minimum against a repo they control, reaps a victim so their fresh weight catches a proportional slice of the distribution, settles the trivial target, and withdraws — 60 seconds of risk capturing the same per-unit reward as capital locked for 90 days. That is a rational play, not an exotic attack, and it directly voids the economic claim. Time-scaling drops a 60-second commitment to roughly 1/130,000 of the share of an equal 90-day one, well below the 10% slash fee.

The honest consequence: rewards track **capital × time**, not target difficulty. A large staker with an easy target still earns more than a small staker with a hard one.

**Everything is denominated in shMON shares, never MON.** The exchange rate is ~11.73 MON per shMON and rises every block — it is not 1:1. Storing MON amounts would mean snapshotting a moving rate and reconciling drift forever. Storing shares means yield accrues to whoever holds them, with no code.

**Settlement is separated from exit.** `settle` and `reap` are pure storage accounting and never call shMON, so they cannot revert on vault liquidity. `withdraw` clamps to `maxRedeem` rather than reverting — and `maxRedeem` is a *global* vault ceiling shared with every other shMON user, not a per-user limit. `exitInKind` transfers raw shMON as the last resort, which is what makes "funds are never permanently locked" a guarantee rather than a hope.

## Known limitations

Stated plainly, because a system that hides these is indistinguishable from one that hardcodes `return true`.

**The verifier is a hot key. This is trust-minimized, not trustless.** Settlement and exit are trustless — once you have a valid attestation, no one can stop you claiming, and no one can stop you exiting. Verification is delegated to one attesting service. A compromised verifier key could mint fake successes. The contract owner can rotate it via `setVerifier`, which means the owner key carries the same blast radius. Both are disclosed in the app itself, next to the claim button, not just here.

**Self-dealing is bounded, not eliminated.** The 10% slash fee makes each self-dealing round lossy, so it only pays if you control more than 90% of total weight. Fully closing it needs O(n) per-owner exclusion, which was outside the time budget.

**Commit count is a hackathon-grade objectivity proxy, and it is cheap to fabricate.** Empty commits are filtered by requiring a non-empty diff (`stats.total > 0` on each commit's detail endpoint), and only commits authored by the OAuth-bound login on the default branch count. But committer dates are client-settable, so the `since` filter is advisory — someone determined can re-date existing work. This is a reasonable proxy. It is not proof of work.

**Targets are self-chosen with no difficulty floor.** A rational participant picks a target they are confident of hitting, which means staking selects for people who were going to finish anyway. v1 assumes honest target-setting.

**On testnet, this demonstrates mechanism correctness — not behaviour change.** The tests prove settlement, forfeiture routing, and solvency hold under adversarial ordering. They cannot prove the product works on a person, because faucet MON carries no real consequence. That claim requires mainnet and time, and I am not going to make it here.
