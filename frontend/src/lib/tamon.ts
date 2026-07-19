import type {Abi, Address} from "viem";
import abi from "./tamon-abi.json";

/// Generated from contract/out/Tamon.sol/Tamon.json — never hand-written, so a contract change
/// followed by a rebuild cannot silently drift from what the UI thinks it is calling.
export const TAMON_ABI = abi as Abi;

/// From env, never a hard-coded constant. A redeploy is then a config change rather than a
/// code change — which matters because redeploying invalidates every attestation the backend
/// has signed, and that failure presents as "settle always reverts".
export const TAMON_ADDRESS = (process.env.NEXT_PUBLIC_TAMON_ADDRESS ?? "") as Address;

export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";

/// Mirrors the contract's State enum.
export const State = {
  None: 0,
  Active: 1,
  Succeeded: 2,
  Failed: 3,
} as const;

export type StateValue = (typeof State)[keyof typeof State];

export interface Commitment {
  shares: bigint;
  weight: bigint;
  start: bigint;
  deadline: bigint;
  entryAcc: bigint;
  target: number;
  achieved: number;
  state: StateValue;
  repo: string;
}

/// The on-chain classification vocabulary. These strings are permanent in tokenURI, so the UI
/// presents them as a specimen taxonomy rather than translating them away.
export const CLASSIFICATION = {
  utuh: {label: "UTUH", gloss: "intact"},
  lapuk: {label: "LAPUK", gloss: "weathered"},
  retak: {label: "RETAK", gloss: "cracked"},
  hancur: {label: "HANCUR", gloss: "shattered"},
  kristal: {label: "KRISTAL", gloss: "crystallised"},
} as const;

export type Classification = keyof typeof CLASSIFICATION;

/// Same thresholds the contract renders at, so the label never disagrees with the artwork.
export function classify(c: Pick<Commitment, "state" | "start" | "deadline">, now: number): Classification {
  if (c.state === State.Succeeded) return "kristal";
  if (c.state === State.Failed) return "hancur";

  const start = Number(c.start);
  const span = Number(c.deadline) - start;
  if (span <= 0) return "retak";

  const elapsed = Math.max(0, now - start);
  // Past the deadline but unreaped stays cracked. Shattering takes a transaction, and the UI
  // should not imply otherwise.
  if (elapsed >= span) return "retak";

  const pct = (elapsed / span) * 100;
  if (pct < 50) return "utuh";
  if (pct < 80) return "lapuk";
  return "retak";
}

/// Continuous, unlike the five discrete states the contract can render. This is what makes a
/// stone at 51% distinguishable from one at 79%.
export function erosion(c: Pick<Commitment, "start" | "deadline">, now: number): number {
  const start = Number(c.start);
  const span = Number(c.deadline) - start;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (now - start) / span));
}

/// Repo rules mirrored from the contract's _validateRepo. Enforced client-side so a typo
/// surfaces as a form message rather than a raw wallet revert.
export function validateRepo(repo: string): string | null {
  if (!repo) return "Enter a repository as owner/name.";
  if (repo.length > 100) return "Repository name is too long.";
  if (!/^[A-Za-z0-9\-_./]+$/.test(repo)) return "Use only letters, numbers, and - _ . /";

  const parts = repo.split("/");
  if (parts.length !== 2) return "Use exactly one slash, as in owner/name.";
  if (!parts[0] || !parts[1]) return "Both the owner and the name are required.";
  if (parts.some((p) => p === "." || p === "..")) return "That is not a valid repository path.";
  return null;
}

export function timeLeft(deadline: bigint, now: number): string {
  const s = Number(deadline) - now;
  if (s <= 0) return "00:00:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

/// tokenURI returns base64 JSON whose image is a base64 SVG. Unwrap both so the markup can be
/// injected inline — GSAP cannot target paths inside an <img>.
export function decodeTokenUri(uri: string): {svg: string; name: string; description: string} | null {
  try {
    const jsonB64 = uri.replace("data:application/json;base64,", "");
    const meta = JSON.parse(atob(jsonB64)) as {name: string; description: string; image: string};
    const svg = atob(meta.image.replace("data:image/svg+xml;base64,", ""));
    return {svg, name: meta.name, description: meta.description};
  } catch {
    return null;
  }
}
