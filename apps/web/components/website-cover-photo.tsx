"use client";

import Image from "next/image";
import { useState } from "react";

export function WebsiteCoverPhoto({ photo, fallback, className, sizes = "(max-width: 760px) 100vw, 1180px", priority = true }: {
  photo?: { src: string; alt: string } | null | undefined;
  fallback: { src: string; alt: string };
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState<string>();
  const shown = photo && failed !== photo.src ? photo : fallback;
  return <Image alt={shown.alt} className={className} fill priority={priority}
    sizes={sizes} src={shown.src} unoptimized={shown.src.startsWith("/api/")}
    onError={photo && shown === photo ? () => setFailed(photo.src) : undefined} />;
}
