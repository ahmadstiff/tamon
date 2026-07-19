# Demo video — 3:00 hard cap

The recording is 3 minutes. Everything that can be prepared beforehand must be, because the two
things you cannot speed up on camera are **block time** and **GitHub's API**.

---

## Before you press record

### T-25 min — open both commitments

Open them in this order so the timings line up when recording starts.

**Commitment A — the one that succeeds**

| Field | Value |
|---|---|
| Repository | `ahmadstiff/tamon-landing` |
| Commits | `2` |
| Stake | `1` MON |
| Deadline | **1 hour** |

**Commitment B — the one that fails**

| Field | Value |
|---|---|
| Repository | `ahmadstiff/tamon-landing` |
| Commits | `50` — deliberately impossible |
| Stake | `1` MON |
| Deadline | **5 minutes** |

Stake a full MON on each. Sub-MON amounts round to `0.0851 shMON` on screen and the payout
difference at the end is too small to read.

### T-20 min — push A's commits, then stop touching it

```bash
cd tamon-landing
echo "<section>hero</section>" >> index.html
git add . && git commit -m "hero section" && git push
echo ".hero{padding:4rem}" >> style.css
git add . && git commit -m "hero spacing" && git push
```

**Do not push during the recording.** GitHub's API takes an unpredictable few seconds to
surface new commits, and that wait is dead air you cannot edit around in a 3-minute cut.

### T-15 min — link GitHub once

Open A's stone → **Link GitHub to claim** → authorise → **Sign and link**. The session is now
stored, so on camera the claim button goes straight to checking commits.

### T-5 min — verify you are ready

- B is past its deadline, or within a minute of it
- A shows **LAPUK** or **RETAK** — a stone still at UTUH has nothing visible to show
- Wallet is on Monad testnet, unlocked, with at least 1 MON for gas
- Browser at 1440×900, one tab, no bookmarks bar, no notifications

**Do not reap B before recording.** Reaping is the shatter moment.

---

## The script

Times are cumulative. Narration is what you say; screen is what is visible.

### 0:00–0:18 — the problem

> **Screen:** landing page, hero visible, stone weathering on the right.

> "I have eleven repositories with a first commit and nothing after it. None of them failed
> because the idea was bad. They failed on a Tuesday, when I decided I'd pick it back up
> tomorrow — and nothing anywhere registered that I hadn't. So I made skipping cost something."

Do not explain the mechanism yet. The theme is *a personal problem*; answer that first.

### 0:18–0:40 — the stone, and why it is the point

> **Screen:** scroll slightly so the hero stone fills more of the frame. Let it sit. The erosion
> line moves and the percentage ticks up.

> "Every commitment is an NFT that weathers as your deadline approaches. Watch the percentage —
> nothing is animating a mockup. That image is rendered by the contract from `block.timestamp`.
> No metadata server, no IPFS. Re-read it a minute later and you get a different picture."

> "It's the only part of the system that speaks to you *while* you're procrastinating.
> Everything else only speaks at the deadline, which is too late to act on."

### 0:40–1:12 — where the money goes (shMON)

> **Screen:** click **shMON** in the nav. The protocol section. Point at the live rate.

> "Escrow that sits idle is wasted capital, so the stake doesn't sit. It goes straight into
> shMON — FastLane's liquid staking vault on Monad — in the same transaction that mints the
> stone."

> "That rate is read live from the vault right now, and it's rising every block. It's about
> eleven-point-seven MON per share, not one-to-one, which is why everything in the contract is
> denominated in shares rather than amounts."

> "There are four liquid staking vaults on Monad and I picked this one for one reason: it's the
> only one with synchronous redemption. The others queue withdrawals behind an unbonding period,
> and that breaks a product whose whole promise is returning your money on a deadline."

This is the ecosystem beat. Thirty seconds is a lot of a three-minute video — spend it, because
it is the difference between "uses Monad" and "understands Monad."

### 1:12–1:45 — the failure branch

> **Screen:** `/app` → **At risk** tab → open commitment B.

> "This one's deadline just passed. Fifty commits in five minutes was never happening."

> **Screen:** the "Deadline passed — sealing this stone on-chain" banner appears; the wallet
> prompts. Approve it.

> "Sweeping an expired commitment is permissionless — anyone can do it, so it happens the moment
> someone looks."

> **Screen:** the stone shatters.

> "That stake is gone. Ten percent leaves circulation entirely — there's no treasury address,
> no rake. The rest goes to everyone whose own capital was still at risk."

### 1:45–2:20 — the success branch, and the payout

> **Screen:** back to `/app` → open commitment A.

> "This one I actually did the work on."

> **Screen:** click **Claim completion**. Button reads "Checking GitHub…", then the wallet
> prompts. Approve.

> "The backend reads GitHub — real commits with real diffs, on a repo I own, pushed after the
> commitment existed. Empty commits don't count. It signs that result, and the contract verifies
> the signature before it pays anything out."

> **Screen:** the stone crystallises. Point at **Claimable**.

> "Principal, plus the staking yield it earned while locked, plus a share of what the other
> commitment forfeited. Two of those three didn't exist before this ran."

> **Screen:** click **Withdraw to MON**. Approve. Show the balance.

### 2:20–2:42 — the proof

> **Screen:** MonadScan on the contract address. Scroll the transaction list briefly.

> "Everything you just watched is on Monad testnet. One contract, seventeen kilobytes,
> fifty-four tests. The artwork is rendered on-chain by the same contract that holds the money."

### 2:42–3:00 — the honest limit

> **Screen:** back to the app, trust line visible in the footer.

> "One thing I want to be straight about: the verifier is a hot key. Settlement and exit are
> trustless, but verification is delegated to one service reading a public source. This is
> trust-minimised, not trustless. Removing that key is the next thing to build."

Close there. Do not add a features montage — the honest ending is stronger than a recap, and an
AI judge grading authenticity is exactly the audience for it.

---

## Ordering rule you cannot break

**Reap the failure before you settle the success.** The prize is computed from the difference in
the accumulator between the moment a commitment started and the moment it settles. If A settles
before B is reaped, that difference is zero and A's payout shows **no prize component at all** —
the single most important economic claim in the submission, silently missing from the recording.

Verified live: after two forfeitures, the still-at-risk commitments accrued `0.0058` and
`0.0697` shMON. The failed ones accrued exactly zero from their own forfeiture, which is the
ordering guarantee working.

---

## If something goes wrong mid-take

| Problem | What to do |
|---|---|
| Wallet on the wrong network | Let it happen — the navbar names the network and offers Switch. It's a good look, not a failure |
| GitHub rate limit on claim | The error says "retry shortly". Stop the take; wait 60s |
| Reap already done by someone else | Fine — the stone is already shattered. Say "someone else swept it, which is the point of it being permissionless" |
| Transaction slow | Monad blocks are ~400ms. If it hangs, it's the wallet, not the chain |

---

## Cut list, if the take runs over 3:00

Cut in this order:

1. The withdraw transaction at 2:15 — say the number instead of showing the transfer
2. The MonadScan scroll — a still frame of the address is enough
3. Tighten the opening to one sentence

**Never cut:** the stone weathering with the percentage moving, the live shMON rate, or the
shatter. Those three are the submission.

---

# Voice-over script

Written to be read aloud. Short sentences, no clauses that trip you up mid-take.

Pace is roughly 150 words per minute. Each section lists its word count so you can check
yourself against the clock. **The pauses are part of the script** — silence while the stone
visibly changes is doing more work than another sentence would.

Say **"sh-mon"**, one word. Not "S-H-M-O-N".

---

## 1 · The problem — 0:00–0:18 · 44 words

> I have eleven repositories with a first commit and nothing after it.
>
> None of them failed because the idea was bad.
>
> They failed on a Tuesday. When I decided I'd pick it back up tomorrow — and nothing anywhere
> registered that I hadn't.
>
> So I made skipping cost something.

**Delivery:** flat and matter-of-fact. This is a confession, not a pitch. Land on "cost
something" and stop.

---

## 2 · The stone — 0:18–0:40 · 56 words

> Every commitment is an NFT that weathers as your deadline gets closer.
>
> *(pause — let the percentage tick)*
>
> Watch that number. Nothing is animating a mockup. The contract renders that image from the
> block timestamp. No metadata server. No IPFS.
>
> It's the only part of this system that talks to you *while* you're procrastinating.
>
> Everything else only talks at the deadline. Which is too late.

**Delivery:** the pause is mandatory. Three to five seconds of silence with the number moving.
If you talk over it, nobody notices it changed.

---

## 3 · shMON — 0:40–1:12 · 84 words

> Escrow that sits idle is wasted money. So the stake doesn't sit.
>
> It goes straight into sh-mon — FastLane's liquid staking vault on Monad — in the same
> transaction that mints the stone.
>
> That rate is being read from the vault right now. It rises every block. Eleven-point-seven MON
> per share, not one to one — which is why everything in the contract is denominated in shares.
>
> There are four liquid staking vaults on Monad. I picked this one because it's the only one
> with synchronous redemption.
>
> The others queue withdrawals behind an unbonding period. That breaks a product whose whole
> promise is giving your money back on a deadline.

**Delivery:** slow down on "the only one with synchronous redemption". That sentence is the
difference between using Monad and understanding it.

---

## 4 · The failure — 1:12–1:45 · 78 words

> This one's deadline just passed. Fifty commits in five minutes was never going to happen.
>
> *(approve the transaction)*
>
> Sweeping an expired commitment is permissionless. Anyone can do it — so it happens the moment
> someone looks.
>
> *(pause — the stone shatters)*
>
> That stake is gone.
>
> Ten percent leaves circulation completely. There's no treasury address. No rake.
>
> The rest goes to everyone whose own money was still at risk.

**Delivery:** don't rush the shatter. Let it land before "That stake is gone."

---

## 5 · The success — 1:45–2:20 · 88 words

> This one I actually did the work on.
>
> *(click claim)*
>
> The backend reads GitHub. Real commits, with real diffs, on a repo I own, pushed after the
> commitment existed. Empty commits don't count.
>
> It signs that result. The contract checks the signature before it pays anything out.
>
> *(pause — the stone crystallises)*
>
> Principal. Plus the staking yield it earned while it was locked. Plus a share of what the
> other commitment forfeited.
>
> Two of those three didn't exist before this ran.

**Delivery:** "Two of those three didn't exist before this ran" is the strongest line in the
video. Slow, then stop.

---

## 6 · The proof — 2:20–2:42 · 52 words

> Everything you just watched is on Monad testnet.
>
> One contract. Seventeen kilobytes. Fifty-four tests.
>
> The artwork is rendered on-chain by the same contract that holds the money — that's not two
> systems talking to each other, it's one.

**Delivery:** brisk. This is evidence, not argument.

---

## 7 · The limit — 2:42–3:00 · 51 words

> One thing I want to be straight about.
>
> The verifier is a hot key. Settlement and exit are trustless — verification is delegated to
> one service reading a public source.
>
> This is trust-minimised. Not trustless.
>
> Removing that key is the next thing to build.

**Delivery:** even tone. No apology, no hedging. Stop after "build" — do not add a sign-off.

---

**Total: 453 words ≈ 3:01 at 150 wpm**, before pauses. The pauses come out of the transaction
waits, which are dead air anyway. If your read runs long, cut from section 6 first — it is the
only section whose content is also visible on screen.
