import type { Metadata } from "next";
import Link from "next/link";

import { ContentPage } from "../../components/content-page";
import { pageMetadata } from "../../lib/seo";

export const metadata: Metadata = pageMetadata({ path: "/balance-flow", title: "Balance Flow Board", description: "Balance Flow Board ve Studiu Balance v Bruntále je autorská lekce zaměřená na rovnováhu, mobilitu, koordinaci a vědomý pohyb." });

export default function BalanceFlowPage() { return <ContentPage eyebrow="Balance Flow Method" image="/images/studio-balance/lessons/balance-flow.jpeg" imageAlt="Ukázkový vizuál Balance Flow Board." title="Plynulost, stabilita a rovnováha"><p>Balance Flow je autorský koncept Studia Balance založený na vědomém pohybu, koordinaci, mobilitě a rovnováze.</p><p>Tempo lekce je klidné a lektorka jej přizpůsobuje skupině i jednotlivým možnostem.</p><Link className="button" href="/lekce/balance-flow">Detail Balance Flow</Link></ContentPage>; }
