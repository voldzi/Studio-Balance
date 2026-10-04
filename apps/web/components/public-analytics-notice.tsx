import { selectPublicAnalyticsPlan } from "../lib/public-analytics-v2";
import { publicAnalyticsNotice } from "../lib/public-analytics-notice";
import { publicAnalyticsNoticeV2 } from "../lib/public-analytics-notice-v2";

// Exact v2 replacement approved in VCode a56b160; v1 text remains for fallback.
export function PublicAnalyticsNotice() {
  const plan = selectPublicAnalyticsPlan();
  if (!plan.privacyNoticeApproved) return null;
  const notice = plan.runtimeVersion === "vcode-public-v2" ? publicAnalyticsNoticeV2 : publicAnalyticsNotice;
  return <section className="section" aria-labelledby="public-analytics-privacy-title">
    <h2 id="public-analytics-privacy-title">Soukromí a statistika návštěvnosti</h2>
    {notice.cs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    <details lang="en" id="public-analytics-privacy-en"><summary>Privacy and traffic statistics — English</summary>
      {notice.en.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </details>
  </section>;
}
