import { Output, generateText } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { z } from "zod";

import type { DomainSuggestion } from "@/src/lib/domains";

const POPULAR_TLDS = ["com", "net", "org", "io", "co", "app", "dev"];
const CREATIVE_TLDS = ["ai", "io", "co", "me", "app", "xyz", "tech", "design"];

export type GenerateParams = {
  keywords: string[];
  description?: string;
  domainLength: number;
  domainStyle: string;
  tlds?: string[];
};

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

  return `
Generate domain name suggestions based on the following parameters:

${keywords.length > 0 ? `Keywords: ${keywords.join(", ")}` : ""}
${description ? `Project Description: ${description}` : ""}
Preferred Domain Length: ${domainLength} characters (approximately for the name part, excluding TLD)
Domain Style: ${domainStyle}

${tldInstructions}

Please provide 5-10 domain name suggestions that:
1. Are creative and memorable
2. Reflect the keywords and project description
3. Match the requested style (${domainStyle})
4. Are approximately ${domainLength} characters long (excluding TLD)
5. Would likely be available (not common words or very short domains)
6. Each suggestion should include both the domain name and an appropriate TLD

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
