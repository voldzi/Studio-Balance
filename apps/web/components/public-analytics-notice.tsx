import { publicAnalyticsConfig } from "../lib/public-analytics";
import { publicAnalyticsNotice } from "../lib/public-analytics-notice";

// Owner-review draft. This renders nothing until the complete notice is approved.
export function PublicAnalyticsNotice() {
  if (!publicAnalyticsConfig.privacyNoticeApproved) return null;
  return <section className="section" aria-labelledby="public-analytics-privacy-title">
    <h2 id="public-analytics-privacy-title">Soukromí a statistika návštěvnosti</h2>
    {publicAnalyticsNotice.cs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    <details lang="en"><summary>Privacy and traffic statistics — English</summary>
      {publicAnalyticsNotice.en.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </details>
  </section>;
}
