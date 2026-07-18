import {createPublicClient, http, defineChain, type Address} from "viem";
import {privateKeyToAccount} from "viem/accounts";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
  rpcUrls: {default: {http: [process.env.RPC_URL ?? "https://testnet-rpc.monad.xyz"]}},
  blockExplorers: {default: {name: "MonadVision", url: "https://testnet.monadvision.com"}},
  testnet: true,
});

export const publicClient = createPublicClient({chain: monadTestnet, transport: http()});

/// Only the pieces of the contract this service reads.
export const TAMON_ABI = [
  {
    type: "function",
    name: "getCommitment",
    stateMutability: "view",
    inputs: [{name: "tokenId", type: "uint256"}],
    outputs: [
      {
        type: "tuple",
        components: [
          {name: "shares", type: "uint128"},
          {name: "weight", type: "uint128"},
          {name: "start", type: "uint64"},
          {name: "deadline", type: "uint64"},
          {name: "entryAcc", type: "uint256"},
          {name: "target", type: "uint32"},
          {name: "achieved", type: "uint32"},
          {name: "state", type: "uint8"},
          {name: "repo", type: "string"},
        ],
      },
    ],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{name: "tokenId", type: "uint256"}],
    outputs: [{type: "address"}],
  },
] as const;

export const STATE_ACTIVE = 1;

export function tamonAddress(): Address {
  const a = process.env.TAMON_ADDRESS;
  if (!a) throw new Error("TAMON_ADDRESS unset");
  return a as Address;
}

function verifierAccount() {
  const key = process.env.VERIFIER_PRIVATE_KEY;
  if (!key) throw new Error("VERIFIER_PRIVATE_KEY unset");
  return privateKeyToAccount(key as `0x${string}`);
}

/// Sign an attestation the contract will accept.
///
/// tokenId and owner are part of the signed struct on purpose. Without them a single valid
/// signature would settle every commitment its holder owns for the whole ten-minute window —
/// the Active guard only stops the SAME token being settled twice.
///
/// The ten-minute expiry bounds how long a leaked or intercepted signature stays usable. The
/// contract's own deadline check is the primary guard; this is depth.
export async function signAttestation(params: {
  tokenId: bigint;
  owner: Address;
  achieved: number;
}): Promise<{signature: `0x${string}`; expiry: number}> {
  const account = verifierAccount();
  const expiry = Math.floor(Date.now() / 1000) + 10 * 60;

  const signature = await account.signTypedData({
    domain: {
      name: "Tamon",
      version: "1",
      chainId: monadTestnet.id,
      verifyingContract: tamonAddress(),
    },
    types: {
      Attestation: [
        {name: "tokenId", type: "uint256"},
        {name: "owner", type: "address"},
        {name: "achieved", type: "uint32"},
        {name: "expiry", type: "uint64"},
      ],
    },
    primaryType: "Attestation",
    message: {
      tokenId: params.tokenId,
      owner: params.owner,
      achieved: params.achieved,
      expiry: BigInt(expiry),
    },
  });

  return {signature, expiry};
}

export function verifierAddress(): Address {
  return verifierAccount().address;
}
