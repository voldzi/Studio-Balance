import Image from "next/image";
import { PublicAnalyticsLink } from "./public-analytics-link";

const MASSAGE_SITE_URL = "https://masaze.zeleznalady.cz/";

export function MassagePartnerSection() {
  return (
    <section className="massage-partner" aria-labelledby="massage-partner-title">
      <div className="massage-partner-image-wrap">
        <Image
          alt="Klidné prostředí Masáží Jiřina"
          className="massage-partner-image"
          fill
          sizes="(max-width: 620px) calc(100vw - 2rem), (max-width: 900px) 42vw, 560px"
          src="/images/studio-balance/partners/masaze-jirina-studio.jpg"
        />
      </div>
      <div className="massage-partner-copy">
        <p className="eyebrow">Partnerské doporučení</p>
        <h2 id="massage-partner-title">Regenerace po pohybu</h2>
        <p>
          Pro uvolnění zad, šíje a unavených svalů doporučujeme Masáže Jiřina ve
          Vrbně pod Pradědem.
        </p>
        <PublicAnalyticsLink
          analyticsEvent="outbound-click"
          aria-label="Poznat Masáže Jiřina – otevře web masaze.zeleznalady.cz"
          className="button massage-partner-button"
          href={MASSAGE_SITE_URL}
        >
          Poznat Masáže Jiřina
        </PublicAnalyticsLink>
        <span className="massage-partner-domain" aria-hidden="true">
          masaze.zeleznalady.cz
        </span>
      </div>
    </section>
  );
}
