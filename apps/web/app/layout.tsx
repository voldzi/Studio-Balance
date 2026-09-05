import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { StudioStatusProvider } from "../components/studio-status";
import { PwaRegister } from "../components/pwa-register";
import { publicAppUrl } from "../lib/seo";
import "./styles.css";

export const metadata: Metadata = {
  applicationName: "Studio Balance",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Studio Balance" },
  description: "Studio Balance v Bruntále – lekce TRX, Barre, Jumping, Balance Flow, kruhový trénink a Power Yoga.",
  manifest: "/manifest.webmanifest",
  metadataBase: new URL(publicAppUrl()),
  openGraph: {
    description: "Studio Balance v Bruntále – pohybové lekce, aktuální rozvrh a online rezervace.",
    images: [{ alt: "Interiér Studia Balance v Bruntále", url: "/images/studio-balance/studio-hero.jpg" }],
    locale: "cs_CZ",
    siteName: "Studio Balance",
    title: "Studio Balance Bruntál",
    type: "website"
  },
  title: {
    default: "Studio Balance Bruntál | Rozvrh a rezervace lekcí",
    template: "%s | Studio Balance"
  },
  twitter: { card: "summary_large_image" },
  verification: {
    google: "bsph3gyErieQ82fvpW4O9lLyru-hryEet9WfnIhEhV8",
    other: {
      "seznam-wmt": "xEkR6Ht9omRLrPwLuNMMBgG5PJUw0avf",
      "msvalidate.01": "10987C5E57AB2FD8F584F5C5C7FBEA6C"
    }
  }
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#B56E4F"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="cs">
      <body><StudioStatusProvider><PwaRegister />{children}</StudioStatusProvider></body>
    </html>
  );
}
