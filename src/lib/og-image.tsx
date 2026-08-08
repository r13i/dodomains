import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SITE_URL } from "@/src/lib/site";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/**
 * Renders the social card from the given tagline, so the image can never
 * drift from the copy it is called with. There is no static image checked
 * in — callers pass the tagline from `src/lib/site.ts` and the card follows.
 *
 * An optional subtitle renders below the tagline. The homepage uses it for the
 * "checked against N registered domains" value line; /mcp omits it.
 */
export async function renderOgImage(tagline: string, subtitle?: string) {
  const logo = await readFile(
    join(process.cwd(), "public/logo-backgroundless.png"),
  );
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        // Tight enough that a two-line tagline plus the subtitle still fit
        // inside 630px without the flex children overlapping.
        gap: 28,
        padding: 64,
        background: "#ffffff",
        // Every stop is an explicit colour. Satori renders `transparent` as
        // opaque black at zero alpha, which blends to grey rather than
        // fading out — it looks like a smudge, not a gradient.
        backgroundImage:
          "linear-gradient(135deg, #fff4e8 0%, #ffffff 42%, #ffffff 58%, #ffeddc 100%)",
        borderBottom: "16px solid #f97316",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} width={180} height={180} alt="" />

      <div
        style={{
          display: "flex",
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: -2,
          lineHeight: 1.1,
          color: "#111827",
          textAlign: "center",
          maxWidth: 940,
        }}
      >
        {tagline}
      </div>

      {subtitle ? (
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 500,
            lineHeight: 1.2,
            color: "#374151",
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          {subtitle}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: "#c2410c",
          letterSpacing: 1,
        }}
      >
        {SITE_URL.replace("https://", "")}
      </div>
    </div>,
    ogSize,
  );
}
