"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../lib/api-types";

type Transformation = { afterImage: { height: number; url: string; width: number }; attribution: string; beforeImage: { height: number; url: string; width: number }; classType: { name: string; slug: string } | null; id: string; story: string; title: string };

export function TransformationsShowcase({ homepage = false }: { homepage?: boolean }) {
  const [items,setItems]=useState<Transformation[]>([]); const [state,setState]=useState<"loading"|"ready"|"error">("loading");
  const load=useCallback(async()=>{ setState("loading"); try { const query=homepage?"?featured=true":""; setItems((await apiRequest<{items:Transformation[]}>(`/api/v1/transformations${query}`)).items); setState("ready"); } catch { setState("error"); } },[homepage]);
  useEffect(()=>{void load();},[load]);
  if(state==="loading") return homepage?null:<p className="content-message" role="status">Načítáme proměny…</p>;
  if(state==="error") return homepage?null:<div className="content-message" role="alert"><p>Proměny se právě nepodařilo načíst.</p><button className="button button-secondary" onClick={()=>void load()} type="button">Zkusit znovu</button></div>;
  if(!items.length) return homepage?null:<div className="content-message"><p>První skutečné proměny zveřejníme až po výslovném souhlasu klientek.</p><Link className="button button-secondary" href="/rozvrh">Prohlédnout rozvrh</Link></div>;
  const cards=<div className="transformations-grid">{items.map((item)=><article className="transformation-card" key={item.id}><div className="transformation-images"><figure><Image alt={`Před proměnou – ${item.title}`} height={item.beforeImage.height} src={item.beforeImage.url} unoptimized width={item.beforeImage.width}/><figcaption>Před</figcaption></figure><figure><Image alt={`Po proměně – ${item.title}`} height={item.afterImage.height} src={item.afterImage.url} unoptimized width={item.afterImage.width}/><figcaption>Po</figcaption></figure></div><div className="transformation-copy"><p className="eyebrow">Skutečná proměna</p><h3>{item.title}</h3><p>{item.story}</p><strong>{item.attribution}</strong>{item.classType&&<Link className="text-link" href={`/lekce/${item.classType.slug}`}>{item.classType.name}</Link>}</div></article>)}</div>;
  if(!homepage)return cards;
  return <section aria-labelledby="transformations-title" className="transformations-section"><div className="section-heading"><div><p className="eyebrow">Skutečné příběhy</p><h2 id="transformations-title">Proměny, které vznikají pohybem</h2></div><Link className="text-link" href="/promeny">Všechny proměny</Link></div>{cards}</section>;
}
