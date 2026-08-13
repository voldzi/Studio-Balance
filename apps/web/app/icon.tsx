/* eslint-disable @next/next/no-img-element -- ImageResponse renders a data URI, not a page image. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  return renderIcon(size);
}

export async function renderIcon(requestedSize: { height: number; width: number }) {
  const logo = await readFile(join(process.cwd(), "public/images/studio-balance/brand-logo.png"));
  const logoData = `data:image/png;base64,${logo.toString("base64")}`;
  const inset = Math.round(Math.min(requestedSize.width, requestedSize.height) * 0.84);
  const radius = Math.round(Math.min(requestedSize.width, requestedSize.height) * 0.055);

  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#F7F3EE",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%"
      }}
    >
      <img
        alt="Studio Balance"
        height={inset}
        src={logoData}
        style={{ borderRadius: radius, objectFit: "contain", width: `${inset}px` }}
        width={inset}
      />
    </div>,
    requestedSize
  );
}
