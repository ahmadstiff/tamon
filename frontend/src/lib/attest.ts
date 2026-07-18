"use client";

import {BACKEND_URL} from "./tamon";

export interface AttestResult {
  signed: boolean;
  achieved: number;
  target: number;
  /** Present only when signed. */
  signature?: `0x${string}`;
  expiry?: number;
  headSha?: string | null;
  reason?: string;
}

export class AttestError extends Error {
  constructor(
    message: string,
    /** Rate limits and outages are worth retrying; a missed target is not. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/// Ask the verifier to check GitHub and sign, if the target is met.
///
/// The request carries only a tokenId. The repository is read from the chain by the backend,
/// because that's the only copy the caller couldn't have altered after committing.
export async function requestAttestation(tokenId: bigint, sessionToken: string): Promise<AttestResult> {
  const res = await fetch(new URL("/attest", BACKEND_URL), {
    method: "POST",
    headers: {"Content-Type": "application/json", Authorization: `Bearer ${sessionToken}`},
    body: JSON.stringify({tokenId: String(tokenId)}),
  });

  const body = (await res.json().catch(() => ({}))) as AttestResult & {
    error?: string;
    retryable?: boolean;
  };

  if (!res.ok) {
    throw new AttestError(body.error ?? "The attestation service could not be reached.", Boolean(body.retryable));
  }

  return body;
}
