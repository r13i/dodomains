import { ogContentType, ogSize, renderOgImage } from "@/src/lib/og-image";
import { REGISTERED_DOMAIN_COUNT, TAGLINE } from "@/src/lib/site";

export const alt = TAGLINE;
export const size = ogSize;
export const contentType = ogContentType;

export default async function TwitterImage() {
  return renderOgImage(
    TAGLINE,
    `Checked against ${REGISTERED_DOMAIN_COUNT} registered domains`,
  );
}
