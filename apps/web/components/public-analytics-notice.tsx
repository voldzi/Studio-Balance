import { publicAnalyticsConfig } from "../lib/public-analytics";
import { publicAnalyticsNotice } from "../lib/public-analytics-notice";

// Exact CS/EN supplement approved by the owner in VCode on 2026-10-04.
export function PublicAnalyticsNotice() {
  if (!publicAnalyticsConfig.privacyNoticeApproved) return null;
  return <section className="section" aria-labelledby="public-analytics-privacy-title">
    <h2 id="public-analytics-privacy-title">Soukromí a statistika návštěvnosti</h2>
    {publicAnalyticsNotice.cs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    <details lang="en" id="public-analytics-privacy-en"><summary>Privacy and traffic statistics — English</summary>
      {publicAnalyticsNotice.en.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </details>
  </section>;
}
