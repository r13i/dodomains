/**
 * Single source of truth for the site's public copy.
 *
 * The hero, the page metadata and the generated Open Graph image all read
 * TAGLINE from here, so changing the hero copy changes the social card too.
 * Nothing here may be duplicated as a string literal elsewhere.
 */

export const SITE_NAME = "dodomains";
export const SITE_URL = "https://dodomains.dev";

/** The one line the whole site is built around. */
export const TAGLINE = "Free dodo-powered domain name generator using LLMs";

export const DESCRIPTION =
  "Free dodo-powered domain name generator using LLMs. Bring your own API key " +
  "from ChatGPT, Claude, Gemini or any provider, and get creative domain names " +
  "checked against real registrations before you see them.";

export const SEO_KEYWORDS = [
  "free domain generator",
  "LLM domain generator",
  "ChatGPT domain names",
  "AI domain generator",
  "domain availability checker",
  "creative domain names",
  "bring your own API key",
];

export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

export const MCP_TAGLINE = "Give your AI agent a domain availability tool";

export const MCP_DESCRIPTION =
  "Connect dodomains to Claude, Cursor or any MCP client. Your agent checks " +
  "domain availability, scores brandability and fetches registration links " +
  "without leaving the conversation. Free, no account, no API key.";
