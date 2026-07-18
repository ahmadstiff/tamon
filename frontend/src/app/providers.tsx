"use client";

import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import gsap from "gsap";
import {useGSAP} from "@gsap/react";
import {useState} from "react";
import {WagmiProvider} from "wagmi";
import {wagmiConfig} from "@/lib/chain";

// Registering here, once, so every component can call useGSAP without repeating it.
gsap.registerPlugin(useGSAP);

export function Providers({children}: {children: React.ReactNode}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads are cheap and the whole product is about watching time pass.
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
