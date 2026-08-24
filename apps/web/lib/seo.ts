import type { Metadata } from "next";

export const productionPublicAppUrl = "https://studio-balance.cz";

const defaultDescription = "Studio Balance v Bruntále nabízí TRX, Barre, Jumping, Balance Flow, kruhový trénink a Power Yoga. Prohlédněte si rozvrh a rezervujte lekci.";
const defaultImagePath = "/images/studio-balance/studio-hero.jpg";

export function publicAppUrl(): string {
  const fallback = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production"
    ? productionPublicAppUrl
    : "http://localhost:3000";
  const configured = process.env.PUBLIC_APP_URL ?? fallback;

  try {
    return new URL(configured).origin;
  } catch {
    return fallback;
  }
}

export function absolutePublicUrl(path = "/"): string {
  return new URL(path, `${publicAppUrl()}/`).toString();
}

export function pageMetadata({
  description,
  imagePath = defaultImagePath,
  path,
  title
}: {
  description: string;
  imagePath?: string;
  path: `/${string}` | "/";
  title: string;
}): Metadata {
  const canonical = absolutePublicUrl(path);
  const fullTitle = title.includes("Studio Balance") ? title : `${title} | Studio Balance`;

  return {
    alternates: { canonical },
    description,
    openGraph: {
      description,
      images: [{ alt: "Studio Balance v Bruntále", url: imagePath }],
      locale: "cs_CZ",
      siteName: "Studio Balance",
      title: fullTitle,
      type: "website",
      url: canonical
    },
    title,
    twitter: {
      card: "summary_large_image",
      description,
      images: [imagePath],
      title: fullTitle
    }
  };
}

export const homeMetadata: Metadata = {
  ...pageMetadata({
    description: defaultDescription,
    path: "/",
    title: "Studio Balance Bruntál | Rozvrh a rezervace lekcí"
  }),
  title: { absolute: "Studio Balance Bruntál | Rozvrh a rezervace lekcí" }
};

export const privatePageMetadata: Metadata = {
  robots: {
    follow: false,
    index: false,
    nocache: true
  }
};

export function studioStructuredData(): Record<string, unknown> {
  const origin = publicAppUrl();
  const studioId = `${origin}/#studio`;
  const websiteId = `${origin}/#website`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": websiteId,
        "@type": "WebSite",
        inLanguage: "cs-CZ",
        name: "Studio Balance",
        publisher: { "@id": studioId },
        url: `${origin}/`
      },
      {
        "@id": studioId,
        "@type": "SportsActivityLocation",
        address: {
          "@type": "PostalAddress",
          addressCountry: "CZ",
          addressLocality: "Bruntál",
          postalCode: "792 01",
          streetAddress: "Ruská 10"
        },
        currenciesAccepted: "CZK",
        description: defaultDescription,
        image: absolutePublicUrl(defaultImagePath),
        logo: absolutePublicUrl("/images/studio-balance/brand-logo.jpg"),
        name: "Studio Balance",
        paymentAccepted: "Hotovost, platební karta ve studiu",
        priceRange: "160–250 Kč",
        sameAs: [
          "https://www.instagram.com/studiobalancenl",
          "https://www.facebook.com/share/1arpYabKhn/"
        ],
        url: `${origin}/`
      }
    ]
  };
}
