import type {Metadata} from "next";
import {Archivo, JetBrains_Mono} from "next/font/google";
import "./globals.css";
import {Providers} from "./providers";

// Replacing Geist deliberately. Archivo is industrial and utilitarian — closer to survey
// equipment than to a SaaS dashboard. JetBrains Mono carries every number in the app, which
// suits an audience that reads monospace all day anyway.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "600", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Tamon — stake against your own procrastination",
  description:
    "Stake MON against a GitHub commit target. Miss it and your stake funds someone who didn't. Every commitment is a stone that weathers on-chain as the deadline approaches.",
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${jetbrains.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
