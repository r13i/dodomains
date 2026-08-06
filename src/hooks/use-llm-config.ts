"use client";

import { useCallback, useEffect, useState } from "react";

import { getProvider } from "@/src/lib/providers";

export type LlmConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

export const LLM_STORAGE_KEY = "dodomains.llm.v1";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validates whatever is in storage. A stored config can go stale when a
 * provider is removed from the registry, so this rejects rather than trusts.
 */
export function readStoredConfig(raw: string | null): LlmConfig | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const c = parsed as Record<string, unknown>;

  if (!isNonEmptyString(c.provider)) return null;
  if (!isNonEmptyString(c.model)) return null;
  if (!isNonEmptyString(c.apiKey)) return null;

  const meta = getProvider(c.provider);
  if (!meta) return null;
  if (meta.needsBaseUrl && !isNonEmptyString(c.baseUrl)) return null;

  return {
    provider: c.provider,
    model: c.model,
    apiKey: c.apiKey,
    ...(isNonEmptyString(c.baseUrl) ? { baseUrl: c.baseUrl } : {}),
  };
}

export function useLlmConfig() {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [ready, setReady] = useState(false);

  // Storage is read after mount so the server and client render the same markup.
  useEffect(() => {
    try {
      setConfig(readStoredConfig(window.localStorage.getItem(LLM_STORAGE_KEY)));
    } catch {
      setConfig(null);
    }
    setReady(true);
  }, []);

  const save = useCallback((next: LlmConfig) => {
    setConfig(next);
    try {
      window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing can refuse writes. The in-memory config still works
      // for this session.
    }
  }, []);

  const clear = useCallback(() => {
    setConfig(null);
    try {
      window.localStorage.removeItem(LLM_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { config, save, clear, ready };
}
