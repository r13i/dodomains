import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { SITE_URL } from "@/src/lib/site";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

/**
 * The same thin vertical wavy strips the homepage renders behind the hero
 * (src/components/ui/waves.tsx), frozen as static SVG paths. Deterministic —
 * sin() stands in for randomness so the card renders identically every time.
 */
function stripPaths(width: number, height: number): string[] {
  const gap = 30;
  const segment = 130;
  const count = Math.ceil(width / gap) + 1;
  const segments = Math.ceil(height / segment) + 1;
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = i * gap;
    let d = `M ${x} -20`;
    for (let s = 0; s < segments; s++) {
      const y = s * segment;
      const amp = 7 * Math.sin(i * 12.9898 + s * 4.1414);
      d += ` C ${x + amp} ${y + 43}, ${x - amp} ${y + 87}, ${x} ${y + segment}`;
    }
    paths.push(d);
  }
  return paths;
}

export type OgCardOptions = {
  headline: string;
  subhead?: string;
  chips?: string[];
  width?: number;
  height?: number;
};

/**
 * Renders the social card in the homepage hero's visual language: white
 * background, wavy strip texture, the round logo, then the copy the caller
 * passes — so the image can never drift from `src/lib/site.ts`.
 *
 * The same renderer serves 1200x630 (OG/Twitter) and any other size (e.g.
 * a 1280x720 YouTube thumbnail); type sizes scale off the card height.
 */
export async function renderOgImage(options: OgCardOptions) {
  const { headline, subhead, chips } = options;
  const width = options.width ?? ogSize.width;
  const height = options.height ?? ogSize.height;
  // 1200x630 is the design size; scale off the tighter axis so long lines
  // that fit at the design size still fit at other aspect ratios.
  const k = Math.min(width / ogSize.width, height / ogSize.height);

  const logo = await readFile(join(process.cwd(), "public/logo-backgroundless.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 26 * k,
          padding: 56 * k,
          background: "#ffffff",
        }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          {stripPaths(width, height).map((d, i) => (
            <path key={i} d={d} stroke="#e4e4e7" strokeWidth={1} fill="none" />
          ))}
        </svg>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          width={224 * k}
          height={224 * k}
          alt=""
          style={{ borderRadius: 9999 }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10 * k,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 52 * k,
              fontWeight: 700,
              letterSpacing: -1.5,
              lineHeight: 1.15,
              color: "#111827",
              textAlign: "center",
              maxWidth: width - 120 * k,
            }}
          >
            {headline}
          </div>

          {subhead ? (
            <div
              style={{
                display: "flex",
                fontSize: 30 * k,
                fontWeight: 500,
                lineHeight: 1.25,
                color: "#4b5563",
                textAlign: "center",
                maxWidth: width - 120 * k,
              }}
            >
              {subhead}
            </div>
          ) : null}
        </div>

        {chips && chips.length > 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14 * k,
              fontSize: 24 * k,
              color: "#6b7280",
            }}
          >
            {chips.map((chip, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                {i > 0 ? (
                  <div style={{ display: "flex", marginRight: 14 * k }}>•</div>
                ) : null}
                {chip}
              </div>
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            fontSize: 28 * k,
            fontWeight: 600,
            color: "#c2410c",
            letterSpacing: 1,
          }}
        >
          {SITE_URL.replace("https://", "")}
        </div>
      </div>
    ),
    { width, height, emoji: "twemoji" },
  );
}
