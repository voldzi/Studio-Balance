import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PwaRegister } from "../components/pwa-register";
import "./styles.css";

const publicAppUrl = process.env.PUBLIC_APP_URL ?? (
  process.env.APP_ENV === "production" ? "https://studio-balance.cz" : "http://localhost:3000"
);

export const metadata: Metadata = {
  applicationName: "Studio Balance",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Studio Balance" },
  description: "Boutique pohybové studio pro sílu, klid a rovnováhu.",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(publicAppUrl),
  openGraph: {
    description: "Boutique pohybové studio pro sílu, klid a rovnováhu.",
    locale: "cs_CZ",
    siteName: "Studio Balance",
    title: "Studio Balance",
    type: "website",
    url: "/"
  },
  title: {
    default: "Studio Balance",
    template: "%s | Studio Balance"
  }
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#B56E4F"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="cs">
      <body><PwaRegister />{children}</body>
    </html>
  );
}
