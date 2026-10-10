import type { Metadata } from "next";

import { ReviewQrPrint } from "../../../components/review-qr-print";
import { privatePageMetadata } from "../../../lib/seo";

export const metadata: Metadata = {
  ...privatePageMetadata,
  title: "QR kód pro recenze | Studio Balance",
  description: "Kartička k vytištění: klient otevře formulář recenze na svém telefonu."
};

export default function ReviewQrPage() {
  return <main><ReviewQrPrint /></main>;
}
