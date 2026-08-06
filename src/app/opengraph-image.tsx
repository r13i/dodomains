import { ogContentType, ogSize, renderOgImage } from "@/src/lib/og-image";
import { TAGLINE } from "@/src/lib/site";

export const alt = TAGLINE;
export const size = ogSize;
export const contentType = ogContentType;

export default async function OpengraphImage() {
  return renderOgImage();
}
