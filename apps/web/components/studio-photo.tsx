"use client";

import Image from "next/image";
import { useState } from "react";
import type { StudioImage } from "../lib/api-types";

export function StudioPhoto({ image, priority = false }: { image: StudioImage | null; priority?: boolean }) {
  const [failedSource, setFailedSource] = useState<string>();
  return <div className="studio-photo">
    {image && failedSource !== image.src ? <Image src={image.src} alt={image.alt} width={image.width} height={image.height}
      sizes="(max-width: 620px) 90vw, 480px" priority={priority} unoptimized={image.src.startsWith("/api/")}
      onError={() => setFailedSource(image.src)} /> : <p className="studio-photo-fallback">Fotografie není k dispozici.</p>}
  </div>;
}
