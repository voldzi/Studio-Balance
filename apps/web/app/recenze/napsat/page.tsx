import type { Metadata } from "next";
import Link from "next/link";
import { ReviewSubmissionForm } from "../../../components/review-submission-form";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { pageMetadata, privatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({ path: "/recenze/napsat", title: "Napsat recenzi", description: "Podělte se o svou zkušenost se Studiem Balance. Přihlášení není potřeba; recenzi nejprve zkontroluje studio." }),
  ...privatePageMetadata
};

export default function WriteReviewPage() {
  return <><SiteHeader /><main className="content-shell review-submission-shell">
    <header className="page-heading"><Link className="text-link" href="/recenze">← Zpět na recenze</Link><p className="eyebrow">Vaše zkušenost</p><h1>Napsat recenzi</h1><p>Pomozte dalším klientům poznat naše studio a nám se zlepšovat.</p></header>
    <ReviewSubmissionForm />
  </main><SiteFooter /></>;
}
