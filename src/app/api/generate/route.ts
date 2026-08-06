import { NextResponse } from "next/server";
import { z } from "zod";

import { checkAvailability } from "@/src/lib/domains";
import { generateDomains } from "@/src/lib/generate";
import { llmSchema } from "@/src/lib/llm-schema";
import { mapProviderError } from "@/src/lib/llm-errors";
import { getProvider } from "@/src/lib/providers";
import { resolveModel } from "@/src/lib/providers.server";

export const maxDuration = 60;

const generateRequestSchema = z
  .object({
    keywords: z.array(z.string().max(30)).max(5).default([]),
    description: z.string().max(300).optional(),
    // Optional: the client omits these when the Customize section is
    // collapsed, so the model chooses length, style and TLDs itself.
    domainLength: z.number().min(3).max(20).optional(),
    domainStyle: z.string().min(1).optional(),
    tlds: z.array(z.string()).optional(),
    llm: llmSchema,
  })
  .refine(
    (d) => d.keywords.length > 0 || (d.description ?? "").trim().length > 0,
    {
      error: "Provide keywords or a description",
      path: ["keywords"],
    },
  );

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = generateRequestSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { llm, ...params } = parsed.data;
  const providerLabel = getProvider(llm.provider)?.label ?? llm.provider;

  try {
    const model = resolveModel(llm);
    const suggestions = await generateDomains(model, params);
    const results = await checkAvailability(suggestions);
    return NextResponse.json({ results });
  } catch (error) {
    const mapped = mapProviderError(error, providerLabel, llm.model);
    // Log the code only. The error object can carry request bodies.
    console.error("Generation failed:", mapped.code);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}
