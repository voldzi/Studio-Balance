import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";

export const metadata: Metadata = { title: "Balance Flow", description: "Autorská metoda Studio Balance pro rovnováhu, mobilitu a plynulý pohyb." };

export default function BalanceFlowPage() { return <ContentPage eyebrow="Balance Flow Method" image="/images/studio-balance/lessons/balance-flow.jpeg" imageAlt="Ukázkový vizuál Balance Flow Board." title="Plynulost, stabilita a rovnováha"><p>Balance Flow je autorský koncept Studia Balance založený na vědomém pohybu, koordinaci, mobilitě a rovnováze.</p><p>Tempo lekce je klidné a lektorka jej přizpůsobuje skupině i jednotlivým možnostem.</p><Link className="button" href="/lekce/balance-flow">Detail Balance Flow</Link></ContentPage>; }
