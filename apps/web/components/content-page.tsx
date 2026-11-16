import { WebsiteCoverPhoto } from "./website-cover-photo";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function ContentPage({ children, afterContent, eyebrow, image, imageAlt, photo, title }: { children: React.ReactNode; afterContent?: React.ReactNode; eyebrow: string; image?: string; imageAlt?: string; photo?: { src: string; alt: string } | null | undefined; title: string }) {
  return <><SiteHeader /><main className="content-shell"><header className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></header>{image && <div className="content-hero-image"><WebsiteCoverPhoto photo={photo} fallback={{ src: image, alt: imageAlt ?? "Studio Balance" }} /></div>}<div className="content-prose">{children}</div>{afterContent}</main><SiteFooter /></>;
}
