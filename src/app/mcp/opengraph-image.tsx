import { ogContentType, ogSize, renderOgImage } from "@/src/lib/og-image";
import { MCP_TAGLINE } from "@/src/lib/site";

export const alt = MCP_TAGLINE;
export const size = ogSize;
export const contentType = ogContentType;

export default async function OpengraphImage() {
  return renderOgImage({ headline: MCP_TAGLINE });
}
