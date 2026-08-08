/**
 * Single source of truth for the site's public copy.
 *
 * The hero, the page metadata and the generated Open Graph image all read
 * TAGLINE from here, so changing the hero copy changes the social card too.
 * Nothing here may be duplicated as a string literal elsewhere.
 */

export const SITE_NAME = "dodomains";
export const SITE_URL = "https://dodomains.dev";

/**
 * The count of registered domains every suggestion is checked against.
 * One constant so the hero, the metadata and the OG card can never disagree.
 * If the dataset grows, change it here and everything follows.
 */
export const REGISTERED_DOMAIN_COUNT = "270M+";

/**
 * TAGLINE is the SEO line: it feeds the <title>, the OG/Twitter cards and the
 * meta description, so it stays keyword-rich. HERO_* is the visible hook a
 * human reads first — a joke, deliberately not keyword-shaped. The two are
 * separate on purpose; do not collapse them.
 */
export const TAGLINE = "Free dodo-powered domain name generator using LLMs";

export const HERO_HEADLINE = "Anyone can ship code. Marketing is hard.";

export const HERO_SUBHEAD =
  "Don't let a bad name send your project the way of the dodo 🪦🍗";

export const DESCRIPTION =
  "Free dodo-powered domain name generator using LLMs. Bring your own API key " +
  `from ChatGPT, Claude, Gemini or any provider. Every name is checked against ` +
  `${REGISTERED_DOMAIN_COUNT} registered domains, so you only see ones you can actually register.`;

export const SEO_KEYWORDS = [
  "free domain generator",
  "LLM domain generator",
  "ChatGPT domain names",
  "AI domain generator",
  "domain availability checker",
  "available domain finder",
  "creative domain names",
  "bring your own API key",
];

export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

export const MCP_TAGLINE = "Give your AI agent a domain availability tool";

export const MCP_DESCRIPTION =
  "Connect dodomains to Claude, Cursor or any MCP client. Your agent checks " +
  "domain availability, scores brandability and fetches registration links " +
  "without leaving the conversation. Free, no account, no API key.";
