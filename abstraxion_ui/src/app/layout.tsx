"use client";
import React from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import {
  AbstraxionProvider,
  type AbstraxionConfig,
} from "@burnt-labs/abstraxion";
import { ThemeProvider } from "@/components/ThemeProvider";
import { CHAIN_ID, RPC_URL, REST_URL, TREASURY_ADDRESS, CHESS_CONTRACT_ADDRESS } from "@/config";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const abstraxionConfig: AbstraxionConfig = {
  chainId: CHAIN_ID,
  treasury: TREASURY_ADDRESS,
  rpcUrl: RPC_URL,
  restUrl: REST_URL,
  contracts: [CHESS_CONTRACT_ADDRESS],
  authentication: {
    type: "auto" as const,
    authAppUrl: "http://localhost:3000",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans">
        <AbstraxionProvider config={abstraxionConfig}>
          <ThemeProvider>{children}</ThemeProvider>
        </AbstraxionProvider>
      </body>
    </html>
  );
}
