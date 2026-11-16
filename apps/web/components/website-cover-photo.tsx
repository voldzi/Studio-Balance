"use client";

import Image from "next/image";
import { useState } from "react";

export function WebsiteCoverPhoto({ photo, fallback, className }: {
  photo?: { src: string; alt: string } | null | undefined;
  fallback: { src: string; alt: string };
  className?: string;
}) {
  const [failed, setFailed] = useState<string>();
  const shown = photo && failed !== photo.src ? photo : fallback;
  return <Image alt={shown.alt} className={className} fill priority
    sizes="(max-width: 760px) 100vw, 1180px" src={shown.src} unoptimized={shown.src.startsWith("/api/")}
    onError={photo && shown === photo ? () => setFailed(photo.src) : undefined} />;
}
