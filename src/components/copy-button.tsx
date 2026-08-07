"use client";

import { useState } from "react";

import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * Copies `value` to the clipboard and flips its label to "Copied" for two
 * seconds. `navigator.clipboard.writeText` rejects on an insecure origin
 * (any non-HTTPS, non-localhost context), so the call is wrapped in
 * try/catch — an unhandled rejection there would take the page down.
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied or unavailable (e.g. insecure origin).
      // Nothing to recover — the button simply doesn't flip to "Copied".
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("shrink-0", className)}
      onClick={handleCopy}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}
