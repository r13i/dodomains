import { generateText } from "ai";
import { NextResponse } from "next/server";

import { mapProviderError } from "@/src/lib/llm-errors";
import { llmSchema } from "@/src/lib/llm-schema";
import { getProvider } from "@/src/lib/providers";
import { resolveModel } from "@/src/lib/providers.server";

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = llmSchema.safeParse(await request.json());
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
