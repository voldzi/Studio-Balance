import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { PwaRegister } from "../components/pwa-register";
import "./styles.css";

export const metadata: Metadata = {
  applicationName: "Studio Balance",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Studio Balance" },
  description: "Boutique pohybové studio pro sílu, klid a rovnováhu.",
  manifest: "/manifest.webmanifest",
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
