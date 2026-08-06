"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useLlmConfig, type LlmConfig } from "@/src/hooks/use-llm-config";
import { PROVIDERS, defaultModel, getProvider } from "@/src/lib/providers";
import { cn } from "@/src/lib/utils";

export type ModelConnectionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Status = "idle" | "testing" | "failed";

export function ModelConnection({ open, onOpenChange }: ModelConnectionProps) {
  const { config, save, clear, ready } = useLlmConfig();

  const [providerId, setProviderId] = useState("openai");
  const [model, setModel] = useState(defaultModel("openai"));
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const meta = getProvider(providerId);

  // Fill the form from storage once it has been read.
  useEffect(() => {
    if (!ready || !config) return;
    setProviderId(config.provider);
    setModel(config.model);
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl ?? "");
  }, [ready, config]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function pickProvider(id: string) {
    setProviderId(id);
    setModel(defaultModel(id));
    setApiKey(""); // never carry one provider's key to another
    setBaseUrl("");
    setError(null);
    setStatus("idle");
  }

  const prefixMismatch = Boolean(
    apiKey && meta?.keyPrefix && !apiKey.startsWith(meta.keyPrefix),
  );

  const canSubmit =
    Boolean(apiKey && model && meta) &&
    (!meta?.needsBaseUrl || baseUrl.trim().length > 0) &&
    status !== "testing";

  async function saveAndTest() {
    if (!meta) return;
    const next: LlmConfig = {
      provider: providerId,
      model,
      apiKey,
      ...(meta.needsBaseUrl ? { baseUrl } : {}),
    };

    setStatus("testing");
    setError(null);

    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("failed");
        setError(data.error ?? "Could not reach the provider.");
        return;
      }
      save(next);
      setStatus("idle");
      onOpenChange(false);
    } catch {
      setStatus("failed");
      setError("Could not reach dodomains. Check your connection.");
    }
  }

  function clearAll() {
    clear();
    setApiKey("");
    setStatus("idle");
    setError(null);
  }

  const dot =
    status === "testing"
      ? "bg-muted-foreground animate-pulse"
      : status === "failed"
        ? "bg-destructive"
        : config
          ? "bg-chart-2"
          : "bg-muted-foreground";

  const triggerLabel =
    status === "testing"
      ? "Testing…"
      : status === "failed"
        ? "Key rejected"
        : config
          ? (getProvider(config.provider)?.label ?? config.provider)
          : "Connect model";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-background/80 hover:bg-background/90 transition-colors backdrop-blur-sm border-2 border-border/70"
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
        <span className="max-w-32 truncate">{triggerLabel}</span>
        {config && status === "idle" ? (
          <span className="hidden sm:inline font-mono text-xs text-muted-foreground max-w-32 truncate">
            {config.model}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => onOpenChange(false)}
          />
          <div
            role="dialog"
            aria-label="Connect your model"
            className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border bg-background p-5 shadow-lg"
          >
            <div className="grid gap-5">
              <div className="grid gap-1">
                <h2 className="font-semibold">Connect your model</h2>
                <p className="text-sm text-muted-foreground">
                  Bring a key from any provider. You pay the provider directly,
                  at their cost.
                </p>
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="llm-provider">Provider</Label>
                  {meta?.free ? <Badge>Allows free API key</Badge> : null}
                </div>
                <Select value={providerId} onValueChange={pickProvider}>
                  <SelectTrigger id="llm-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="llm-model">Model</Label>
                  <a
                    href="https://hail.so/costs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Compare prices ↗
                  </a>
                </div>
                <Input
                  id="llm-model"
                  className="font-mono"
                  list="llm-model-options"
                  value={model}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setModel(e.target.value)}
                />
                <datalist id="llm-model-options">
                  {(meta?.models ?? []).map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      label={`$${m.in.toFixed(2)} / $${m.out.toFixed(2)}`}
                    />
                  ))}
                </datalist>
                <span className="text-xs text-muted-foreground">
                  {meta?.gateway
                    ? `${meta.label} uses its own model ids. Copy the exact id from ${meta.keyHost}.`
                    : "Pick one, or type any model id your key can reach."}
                </span>
              </div>

              {meta?.needsBaseUrl ? (
                <div className="grid gap-2">
                  <Label htmlFor="llm-base-url">Base URL</Label>
                  <Input
                    id="llm-base-url"
                    className="font-mono"
                    placeholder="http://localhost:11434/v1"
                    value={baseUrl}
                    spellCheck={false}
                    onChange={(e) => setBaseUrl(e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">
                    Any OpenAI-compatible endpoint.
                  </span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="llm-key">API key</Label>
                <div className="relative flex">
                  <Input
                    id="llm-key"
                    className="font-mono pr-14"
                    type={revealed ? "text" : "password"}
                    placeholder={
                      meta?.keyPrefix ? `${meta.keyPrefix}...` : "your API key"
                    }
                    value={apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    // Pasted keys routinely carry a stray space or quote.
                    onChange={(e) =>
                      setApiKey(e.target.value.replace(/[\s"']/g, ""))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {revealed ? "hide" : "show"}
                  </button>
                </div>
                {prefixMismatch ? (
                  <span className="text-xs text-destructive">
                    {meta?.label} keys start with &quot;{meta?.keyPrefix}&quot;.
                    Check you copied all of it.
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Your key is used only to call your provider. dodomains never
                stores it.
              </p>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={saveAndTest}
                  disabled={!canSubmit}
                >
                  {status === "testing" ? "Testing…" : "Save and test"}
                </Button>
                <Button variant="ghost" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
