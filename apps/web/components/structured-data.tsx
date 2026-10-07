import { headers } from "next/headers";

export async function StructuredData({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} type="application/ld+json" />;
}
