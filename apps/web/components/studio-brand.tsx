"use client";

import Image from "next/image";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { StudioImage } from "../lib/api-types";

const StudioBrand = createContext<StudioImage | null>(null);

export function StudioBrandProvider({ logo, children }: { logo: StudioImage | null; children: ReactNode }) {
  return <StudioBrand.Provider value={logo}>{children}</StudioBrand.Provider>;
}

export function StudioBrandLogo({ header = false }: { header?: boolean }) {
  const logo = useContext(StudioBrand);
  const [failedSource, setFailedSource] = useState<string>();
  return logo && failedSource !== logo.src
    ? <Image className="custom-studio-logo" src={logo.src} alt="Studio Balance" width={logo.width} height={logo.height}
        unoptimized priority={header} onError={() => setFailedSource(logo.src)} />
    : <Image src="/images/studio-balance/brand-logo.jpg" alt="Studio Balance"
        width={header ? 120 : 154} height={header ? 72 : 92} priority={header} />;
}
