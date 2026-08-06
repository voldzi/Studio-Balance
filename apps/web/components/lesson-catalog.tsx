"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiRequest, type ClassType } from "../lib/api-types";
import { DifficultyStars } from "./difficulty-stars";

export function LessonCatalog({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<ClassType[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      setItems((await apiRequest<{ items: ClassType[] }>("/api/v1/class-types")).items);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  if (state === "loading") return <p className="content-message" role="status">Načítáme nabídku lekcí…</p>;
  if (state === "error") return <div className="content-message" role="alert"><p>Lekce se právě nepodařilo načíst.</p><button className="button button-secondary" onClick={() => void load()} type="button">Zkusit znovu</button></div>;

  return <div className={compact ? "lesson-grid lesson-grid-compact" : "lesson-grid"}>
    {items.map((lesson) => <article className="lesson-card" key={lesson.id}>
      <Link aria-label={`Detail lekce ${lesson.name}`} className="lesson-card-link" href={`/lekce/${lesson.slug}`}>
        <div className="lesson-image-wrap">
          {lesson.heroImage ? <Image alt={lesson.heroImage.alt} className={`lesson-image${lesson.slug === "power-joga" ? " lesson-image-cover" : ""}`} fill priority={["barre", "trx", "balance-flow"].includes(lesson.slug)} sizes="(max-width: 620px) 100vw, (max-width: 960px) 50vw, 33vw" src={lesson.heroImage.src} /> : <div className="lesson-image-fallback" aria-hidden="true" />}
        </div>
        <div className="lesson-copy">
          <p className="lesson-difficulty"><DifficultyStars value={lesson.difficulty} /></p>
          <h3>{lesson.name}</h3>
          <p>{lesson.tagline}</p>
        </div>
      </Link>
    </article>)}
  </div>;
}
