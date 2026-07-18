import {defineChain} from "viem";
import {createConfig, http} from "wagmi";
import {injected} from "wagmi/connectors";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {name: "MON", symbol: "MON", decimals: 18},
  rpcUrls: {default: {http: ["https://testnet-rpc.monad.xyz"]}},
  blockExplorers: {default: {name: "MonadVision", url: "https://testnet.monadvision.com"}},
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: {[monadTestnet.id]: http()},
  ssr: true,
});

export const EXPLORER = monadTestnet.blockExplorers.default.url;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
