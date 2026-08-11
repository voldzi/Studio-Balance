/* eslint-disable @next/next/no-img-element -- ImageResponse renders a data URI, not a page image. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  const logo = await readFile(join(process.cwd(), "public/images/studio-balance/brand-logo.jpg"));
  const logoData = `data:image/jpeg;base64,${logo.toString("base64")}`;

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
        height={430}
        src={logoData}
        style={{ borderRadius: 28, objectFit: "contain", width: "430px" }}
        width={430}
      />
    </div>,
    size
  );
}
