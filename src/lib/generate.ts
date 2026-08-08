import { Output, generateText } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { z } from "zod";

import type { DomainSuggestion } from "@/src/lib/domains";

const POPULAR_TLDS = ["com", "net", "org", "io", "co", "app", "dev", "ai"];
const CREATIVE_TLDS = ["ai", "io", "co", "me", "app", "xyz", "tech", "design"];

export type GenerateParams = {
  keywords: string[];
  description?: string;
  /** Omitted when the visitor has the Customize section collapsed. */
  domainLength?: number;
  /** Omitted when the visitor has the Customize section collapsed. */
  domainStyle?: string;
  tlds?: string[];
};

// The old prompt ended with "Return only valid domain suggestions in JSON format"
// and a literal JSON skeleton. Both are deliberately gone: Output.object() enforces
// the schema through each provider's native mechanism, and a competing "reply in
// JSON" instruction degrades that on several of them. Do not restore them.
export const SYSTEM_PROMPT =
  "You are a domain name generation expert. Generate creative, memorable, and " +
  "available domain names based on the provided keywords and parameters.";

export const domainSuggestionSchema = z.object({
  domains: z
    .array(z.object({ name: z.string().min(1), tld: z.string().min(1) }))
    .min(5)
    .max(10),
});

export function buildPrompt(params: GenerateParams): string {
  const { keywords, description, domainLength, domainStyle, tlds } = params;
  const userSelectedTlds = Boolean(tlds && tlds.length > 0);

  const tldInstructions = userSelectedTlds
    ? `TLDs to consider: ${tlds!.join(", ")}
Please only use these specific TLDs in your suggestions.`
    : `No specific TLDs were selected by the user.
Please choose appropriate TLDs from popular options like: ${(domainStyle ===
        "creative" || domainStyle === "funny"
        ? CREATIVE_TLDS
        : POPULAR_TLDS
      ).join(", ")}
Select the TLD that best fits each domain name. For professional domains, prefer .com when appropriate.
For each suggestion, pick the TLD that enhances the domain's meaning or marketability.`;

  // Length and style are omitted when the visitor has the Customize section
  // collapsed. Constraining the model on settings it was never shown produces
  // suggestions the visitor did not ask for.
  const requirements = [
    "Are creative and memorable",
    "Reflect the keywords and project description",
    ...(domainStyle ? [`Match the requested style (${domainStyle})`] : []),
    ...(domainLength
      ? [`Are approximately ${domainLength} characters long (excluding TLD)`]
      : []),
    "Would likely be available (not common words or very short domains)",
    "Each suggestion should include both the domain name and an appropriate TLD",
  ]
    .map((line, i) => `${i + 1}. ${line}`)
    .join("\n");

  return `
Generate domain name suggestions based on the following parameters:

${keywords.length > 0 ? `Keywords: ${keywords.join(", ")}` : ""}
${description ? `Project Description: ${description}` : ""}
${domainLength ? `Preferred Domain Length: ${domainLength} characters (approximately for the name part, excluding TLD)` : ""}
${domainStyle ? `Domain Style: ${domainStyle}` : ""}

${tldInstructions}

Please provide 5-10 domain name suggestions that:
${requirements}

Explanation for different styles:
- "short": Brief, concise domains that are easy to remember
- "brandable": Unique, made-up words that can become strong brand identifiers
- "balanced": A good mix of meaningfulness and creativity
- "creative": Unusual, innovative combinations that stand out
- "funny": Playful, humorous domains that evoke a smile
- "professional": Serious, trustworthy domains suitable for business
`;
}

export async function generateDomains(
  model: LanguageModelV4,
  params: GenerateParams,
): Promise<DomainSuggestion[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: domainSuggestionSchema }),
    instructions: SYSTEM_PROMPT,
    prompt: buildPrompt(params),
    temperature: 0.7,
  });

  return output.domains;
}
