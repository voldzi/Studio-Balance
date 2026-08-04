import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  description: "Boutique pohybové studio pro sílu, klid a rovnováhu.",
  title: {
    default: "Studio Balance",
    template: "%s | Studio Balance"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
