import { ogContentType, ogSize, renderOgImage } from "@/src/lib/og-image";
import {
  HERO_HEADLINE,
  HERO_SUBHEAD,
  REGISTERED_DOMAIN_COUNT,
  TAGLINE,
} from "@/src/lib/site";

export const alt = TAGLINE;
export const size = ogSize;
export const contentType = ogContentType;

export default async function TwitterImage() {
  return renderOgImage({
    headline: HERO_HEADLINE,
    subhead: HERO_SUBHEAD,
    chips: [
      "100% Free to Use",
      "Any LLM Provider",
      `Checked against ${REGISTERED_DOMAIN_COUNT} registered domains`,
    ],
  });
}
