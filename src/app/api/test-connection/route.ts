import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapProviderError } from "@/src/lib/llm-errors";
import { getProvider } from "@/src/lib/providers";
import { resolveModel } from "@/src/lib/providers.server";

const schema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1).max(100),
    apiKey: z.string().min(1).max(500),
    baseUrl: z.string().url().max(300).optional(),
  })
  .refine((l) => Boolean(getProvider(l.provider)), {
    message: "Unknown provider",
    path: ["provider"],
  })
  .refine((l) => !getProvider(l.provider)?.needsBaseUrl || Boolean(l.baseUrl), {
    message: "A base URL is required for a custom provider",
    path: ["baseUrl"],
  });

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = schema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data" },
      { status: 400 },
    );
  }

  const llm = parsed.data;
  const providerLabel = getProvider(llm.provider)?.label ?? llm.provider;

  try {
    const model = resolveModel(llm);
    // One token. Enough to prove the key and the model id, costs a fraction of a cent.
    await generateText({ model, prompt: "ok", maxOutputTokens: 1 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapProviderError(error, providerLabel, llm.model);
    console.error("Connection test failed:", mapped.code);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}
