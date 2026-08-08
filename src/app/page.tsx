"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import posthog from "posthog-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Badge } from "@/src/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { Slider } from "@/src/components/ui/slider";
import { Label } from "@/src/components/ui/label";
import { Waves } from "@/src/components/ui/waves";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Testimonials } from "@/src/components/testimonials";
import { ModelConnection } from "@/src/components/model-connection";
import { useLlmConfig } from "@/src/hooks/use-llm-config";
import {
  HERO_HEADLINE,
  HERO_SUBHEAD,
  REGISTERED_DOMAIN_COUNT,
  TAGLINE,
} from "@/src/lib/site";

// Expanded TLD lists for user selection
// Only TLDs whose availability we can actually verify are offered.
// Dropped: .web (delegated but not registrable by the public), .de/.eu
// (the availability API returns no answer for them), .au (unreliable
// answers at our batch size).
const POPULAR_TLDS = ["com", "net", "org", "io", "co", "app", "dev", "ai"];
const CREATIVE_TLDS = ["me", "xyz", "tech", "design"];
const COUNTRY_TLDS = ["us", "uk", "ca", "fr", "jp"];
const SPECIALTY_TLDS = [
  "store",
  "shop",
  "blog",
  "online",
  "site",
  "digital",
  "cloud",
];

// Inside your component, add these brand color constants
const REGISTRAR_COLORS = {
  godaddy: {
    bg: "bg-[#00A4A6]",
    hover: "hover:bg-[#00858a]",
    text: "text-white",
  },
  namecheap: {
    bg: "bg-[#FF5126]",
    hover: "hover:bg-[#e64621]",
    text: "text-white",
  },
};

const CONFIG_ERROR_CODES = [
  "invalid_key",
  "bad_model",
  "no_credit",
  "provider_unreachable",
];

const DOMAIN_STYLES = [
  { id: "short", label: "Short & Simple" },
  { id: "brandable", label: "Brandable" },
  { id: "balanced", label: "Balanced" },
  { id: "creative", label: "Creative" },
  { id: "funny", label: "Funny" },
  { id: "professional", label: "Professional" },
];

/**
 * The same 0-100 heuristic the MCP `score_domain` tool exposes. It is a
 * heuristic, not a verdict, so the badge stays quiet: no colour scale that
 * would imply more precision than it has.
 */
function ScoreBadge({ score }: { score?: number }) {
  if (typeof score !== "number") return null;
  return (
    <Badge
      variant="secondary"
      className="font-mono text-[10px] tabular-nums"
      title="Brandability score out of 100. A heuristic based on length, pronounceability, hyphens, digits, ending and typo risk."
    >
      {score}
    </Badge>
  );
}

export default function Home() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [currentKeyword, setCurrentKeyword] = useState("");
  const [description, setDescription] = useState("");
  const [domainLength, setDomainLength] = useState([10]);
  const [domainStyle, setDomainStyle] = useState("balanced");
  const [results, setResults] = useState<
    {
      name: string;
      status: "available" | "taken" | "unknown";
      score?: number;
      affiliateLinks?: {
        godaddy: string;
        namecheap: string;
      } | null;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [selectedTlds, setSelectedTlds] = useState<string[]>([]);
  const [tldCategory, setTldCategory] = useState("popular");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Closed by default. While closed, the length/style/TLD values are not sent
  // to the model at all (see generateDomains) — the model chooses them.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { config, ready, save, clear } = useLlmConfig();

  // Constants for keyword limits
  const MAX_KEYWORDS = 5;
  const MAX_KEYWORD_LENGTH = 30;
  const MAX_DESCRIPTION_LENGTH = 300;

  // Array of funny dodo loading messages
  const dodoMessages = [
    "Dodo's tiny brain is working hard...",
    "Hmm, what rhymes with your keywords?",
    "Dodo pecking at random keys...",
    "Eating domain names that taste bad...",
    "Dodo forgot what we're doing...",
    "Bird brain loading... please wait...",
    "Looking under rocks for cool names...",
    "Dodo trying very hard not to go extinct again...",
    "Asking other birds for name ideas...",
    "Dodo fell asleep... waking up now!",
    "Oops! Dodo sat on the keyboard...",
    "Drawing domain names with feathers...",
    "Dodo thinking: 'What would Google name this?'",
    "Running in circles for inspiration...",
    "Dodo brain on fire with ideas!",
    "Your domain eggs are hatching soon...",
    "Dodo making domain magic happen...",
    "Spilling coffee on best domain ideas...",
  ];

  // Get all TLDs based on category
  const getTldsByCategory = (category: string) => {
    switch (category) {
      case "popular":
        return POPULAR_TLDS;
      case "creative":
        return CREATIVE_TLDS;
      case "country":
        return COUNTRY_TLDS;
      case "specialty":
        return SPECIALTY_TLDS;
      default:
        return POPULAR_TLDS;
    }
  };

  const toggleTld = (tld: string) => {
    if (selectedTlds.includes(tld)) {
      setSelectedTlds(selectedTlds.filter((t) => t !== tld));
    } else {
      setSelectedTlds([...selectedTlds, tld]);
    }
  };

  // Get recommended TLDs based on current domain style
  const getRecommendedTlds = () => {
    return domainStyle === "creative" || domainStyle === "funny"
      ? CREATIVE_TLDS
      : POPULAR_TLDS;
  };

  // Accepts a single keyword or a comma-separated list, so pasting
  // "creative, design, studio" adds three keywords rather than one long one.
  const addKeyword = () => {
    const parts = currentKeyword
      .split(",")
      .map((k) => k.trim().slice(0, MAX_KEYWORD_LENGTH))
      .filter((k) => k.length > 0);

    if (parts.length === 0) return;

    const next = [...keywords];
    for (const part of parts) {
      if (next.length >= MAX_KEYWORDS) break;
      if (!next.includes(part)) next.push(part);
    }

    setKeywords(next);
    setCurrentKeyword("");
  };

  const removeKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const generateDomains = async () => {
    if (!config) return;

    posthog.capture("domain_generation_requested", {
      provider: config.provider,
      model: config.model,
      keyword_count: keywords.length,
      has_description: Boolean(description.trim()),
      advanced_customization_enabled: advancedOpen,
      selected_tld_count: advancedOpen ? selectedTlds.length : 0,
    });

    setLoading(true);
    setResults([]);
    setErrorMessage(null);

    // Start the loading message animation
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
      setLoadingMessage(dodoMessages[messageIndex % dodoMessages.length]);
      messageIndex++;
    }, 2000);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          keywords,
          description,
          // Only constrain the model when the visitor can actually see the
          // knobs. With Customize collapsed, the model picks length, style
          // and TLDs itself rather than silently obeying stale settings.
          ...(advancedOpen
            ? {
                domainLength: domainLength[0],
                domainStyle,
                tlds: selectedTlds,
              }
            : {}),
          llm: config,
        }),
      });

      let data: { results?: typeof results; error?: string; code?: string } =
        {};
      try {
        data = await response.json();
      } catch {
        data = {
          error: "The request timed out. Try a faster model, or try again.",
        };
      }

      if (!response.ok) {
        posthog.capture("domain_generation_failed", {
          error_code: data.code ?? "request_failed",
          provider: config.provider,
          model: config.model,
        });
        setErrorMessage(data.error ?? "Failed to generate domains");
        if (data.code && CONFIG_ERROR_CODES.includes(data.code)) {
          setConnectOpen(true);
        }
        return;
      }

      const generatedResults = data.results ?? [];
      posthog.capture("domain_generation_completed", {
        provider: config.provider,
        model: config.model,
        suggestion_count: generatedResults.length,
        available_suggestion_count: generatedResults.filter(
          (domain: { status: string }) => domain.status === "available",
        ).length,
      });
      setResults(generatedResults);
    } catch (error) {
      posthog.capture("domain_generation_failed", {
        error_code: "network_error",
        provider: config.provider,
        model: config.model,
      });
      console.error("Error:", error);
      setErrorMessage("Failed to generate domains. Please try again.");
    } finally {
      clearInterval(messageInterval);
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const hasInput = keywords.length > 0 || description.trim().length > 0;

  const openRegistrar = (
    registrar: "godaddy" | "namecheap",
    affiliateLink: string | undefined,
  ) => {
    if (!affiliateLink) return;
    posthog.capture("registrar_link_opened", { registrar });
    window.open(affiliateLink, "_blank", "noopener,noreferrer");
  };

  return (
    <main>
      <div className="min-h-screen bg-gradient-to-b from-background to-background/80 p-4 sm:p-6 md:p-8 relative pt-16">
        <div className="absolute inset-0 overflow-hidden">
          <Waves
            lineColor="hsl(var(--foreground)/0.02)"
            backgroundColor="transparent"
            waveSpeedX={0.005}
            waveSpeedY={0.002}
            waveAmpX={20}
            waveAmpY={10}
            friction={0.98}
            tension={0.002}
            xGap={30}
            yGap={60}
          />
        </div>

        {/* Model connection + GitHub button in top right corner */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 sm:gap-3">
          {/*
            Hidden below sm: the cluster cannot hold every item on a phone, and
            this link also appears inside the connection panel, so nothing is
            lost by dropping it on small screens.
          */}
          <a
            href="https://hail.so/costs"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
          >
            Compare models ↗
          </a>
          {/*
            Visible on every size. On a phone it shrinks to a compact "MCP"
            pill so the cluster still fits; the full label returns at sm.
            The "Compare models" link above stays hidden on mobile because it
            is duplicated inside the connection panel — this pill is not.
          */}
          <Link
            href="/mcp"
            aria-label="MCP server for AI agents"
            className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-sm rounded-md bg-background/80 hover:bg-background/90 transition-colors backdrop-blur-sm border-2 border-border/70"
          >
            <span className="sm:hidden font-medium">MCP</span>
            <span className="hidden sm:inline">Prefer MCP?</span>
          </Link>
          <ModelConnection
            open={connectOpen}
            onOpenChange={setConnectOpen}
            config={config}
            ready={ready}
            save={save}
            clear={clear}
          />
          <a
            href="https://github.com/r13i/dodomains"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-sm rounded-md bg-background/80 hover:bg-background/90 transition-colors backdrop-blur-sm border-2 border-border/70"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>

        <div className="max-w-5xl mx-auto space-y-8 relative z-10">
          <header className="text-center space-y-4">
            <div className="flex flex-col items-center">
              <div className="relative w-48 h-48 mb-2">
                <Image
                  src="/logo-backgroundless.png"
                  alt="dodomains logo"
                  fill
                  priority
                  className="object-contain"
                />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance max-w-2xl mx-auto backdrop-blur-[1px] bg-background/30 px-2 py-1 rounded">
              {HERO_HEADLINE}
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground text-balance max-w-2xl mx-auto backdrop-blur-[1px] bg-background/30 px-2 py-1 rounded">
              {HERO_SUBHEAD}
            </p>
            <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground backdrop-blur-[1px] bg-background/30 px-2 py-1 rounded">
              <span>100% Free to Use</span>
              <span>•</span>
              <span>Any LLM Provider</span>
              <span>•</span>
              <span>
                Checked against {REGISTERED_DOMAIN_COUNT} registered domains
              </span>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-8">
            {/* Input Card with Glass Effect */}
            <Card className="relative z-10 backdrop-blur-sm bg-background/80 border-opacity-50 shadow-lg">
              <CardHeader>
                <CardTitle>Dodo-Powered Domain Name Generator 🦤</CardTitle>
                <CardDescription>
                  Enter keywords or describe your project, and the model you
                  connected will generate uniquely creative, available domain
                  names. Our hard-working dodo is standing by!
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="keywords">Keywords</Label>
                  <div className="flex gap-2">
                    <Input
                      id="keywords"
                      placeholder="Add keywords (e.g., creative, design). Press enter or use commas."
                      value={currentKeyword}
                      onChange={(e) => setCurrentKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          addKeyword();
                        }
                      }}
                      // Long enough for a full comma-separated list; each part
                      // is trimmed to MAX_KEYWORD_LENGTH when it is added.
                      maxLength={MAX_KEYWORDS * (MAX_KEYWORD_LENGTH + 2)}
                      disabled={keywords.length >= MAX_KEYWORDS}
                    />
                    <Button
                      onClick={addKeyword}
                      className="shrink-0"
                      disabled={
                        keywords.length >= MAX_KEYWORDS ||
                        !currentKeyword.trim()
                      }
                    >
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {keywords.map((keyword) => (
                      <Badge
                        key={keyword}
                        variant="secondary"
                        className="px-3 py-1"
                      >
                        {keyword}
                        <button
                          className="ml-2 text-muted-foreground hover:text-foreground"
                          onClick={() => removeKeyword(keyword)}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {keywords.length}/{MAX_KEYWORDS} keywords (max{" "}
                    {MAX_KEYWORD_LENGTH} characters each)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Project Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Briefly describe your project or website"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    maxLength={MAX_DESCRIPTION_LENGTH}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {description.length}/{MAX_DESCRIPTION_LENGTH} characters
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Add keywords or a description — either one is enough.
                  </p>
                </div>

                <details
                  onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
                  className="rounded-lg border bg-muted/40"
                >
                  <summary className="flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-sm font-medium cursor-pointer list-none transition-colors hover:bg-muted/70 [&::-webkit-details-marker]:hidden">
                    Advanced Customization
                    <ChevronDown
                      aria-hidden="true"
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        advancedOpen && "rotate-180",
                      )}
                    />
                  </summary>
                  <div className="space-y-4 px-4 pb-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label htmlFor="length">Domain Length</Label>
                        <span className="text-muted-foreground text-sm">
                          {domainLength[0]} characters
                        </span>
                      </div>
                      <Slider
                        id="length"
                        min={3}
                        max={20}
                        step={1}
                        value={domainLength}
                        onValueChange={setDomainLength}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Domain Style</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {DOMAIN_STYLES.map((style) => (
                          <div
                            key={style.id}
                            className={`p-2 border rounded flex items-center justify-between cursor-pointer hover:bg-muted/50 ${
                              domainStyle === style.id
                                ? "bg-primary/10 border-primary"
                                : ""
                            }`}
                            onClick={() => setDomainStyle(style.id)}
                          >
                            <span>{style.label}</span>
                            {domainStyle === style.id && (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {domainStyle === "funny"
                          ? "Warning: Our dodo may laugh uncontrollably while generating these"
                          : domainStyle === "professional"
                            ? "Our dodo will put on a tiny business suit for this one"
                            : domainStyle === "creative"
                              ? "The dodo is stretching its creative wings (though it can't fly)"
                              : "Our dodo is fluffing its feathers, ready to think"}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <Label>TLD Options (Optional)</Label>
                        <span className="text-muted-foreground text-xs">
                          Leave unselected for the model to choose
                        </span>
                      </div>

                      {/* TLD Category Selector */}
                      <div className="mb-2">
                        <Tabs
                          value={tldCategory}
                          onValueChange={setTldCategory}
                          className="w-full"
                        >
                          <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="popular">Popular</TabsTrigger>
                            <TabsTrigger value="creative">Creative</TabsTrigger>
                            <TabsTrigger value="country">Country</TabsTrigger>
                            <TabsTrigger value="specialty">
                              Specialty
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      </div>

                      {/* TLD Selection Grid */}
                      <div className="grid grid-cols-4 gap-2">
                        {getTldsByCategory(tldCategory).map((tld) => (
                          <div
                            key={tld}
                            className={`p-2 border rounded flex items-center justify-between cursor-pointer hover:bg-muted/50 ${
                              selectedTlds.includes(tld)
                                ? "bg-primary/10 border-primary"
                                : ""
                            }`}
                            onClick={() => toggleTld(tld)}
                          >
                            <span className="font-mono">.{tld}</span>
                            {selectedTlds.includes(tld) && (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12"></polyline>
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Recommended TLDs Info */}
                      {selectedTlds.length === 0 && (
                        <div className="text-xs text-muted-foreground mt-2">
                          <p className="mb-1">
                            Based on your &quot;{domainStyle}&quot; style, the
                            model will prioritize these TLDs:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {getRecommendedTlds().map((tld) => (
                              <Badge
                                key={tld}
                                variant="outline"
                                className="text-xs"
                              >
                                .{tld}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Selected TLDs Display */}
                      {selectedTlds.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">
                            Selected TLDs:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {selectedTlds.map((tld) => (
                              <Badge
                                key={tld}
                                className="px-2 py-1 flex items-center gap-1"
                              >
                                .{tld}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTld(tld);
                                  }}
                                  className="hover:text-accent-foreground"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                  </svg>
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </details>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <div className="w-full text-center mb-1">
                  <p className="text-sm text-muted-foreground">
                    Our dodo promises not to go extinct before finding your
                    perfect domain 🦤
                  </p>
                </div>
                {errorMessage && (
                  <p className="w-full text-sm text-destructive text-center">
                    {errorMessage}
                  </p>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  variant={ready && !config ? "outline" : "default"}
                  onClick={() =>
                    config ? generateDomains() : setConnectOpen(true)
                  }
                  disabled={!ready || loading || (Boolean(config) && !hasInput)}
                >
                  {!ready
                    ? "Generate Domain Ideas 🦤"
                    : !config
                      ? "Connect a model to generate"
                      : !hasInput
                        ? "Add keywords or a description"
                        : loading
                          ? "Generating Domains..."
                          : "Generate Domain Ideas 🦤"}
                </Button>

                {ready && !config && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Google, Groq and Mistral all issue a free API key in about a
                    minute.
                  </p>
                )}

                {loading && (
                  <div className="w-full text-center mt-2">
                    <p className="text-muted-foreground text-sm italic">
                      {loadingMessage}
                    </p>
                  </div>
                )}
              </CardFooter>
            </Card>

            {/* Results Card with Glass Effect */}
            {results.length > 0 && (
              <Card className="backdrop-blur-sm bg-background/80 border-opacity-50 shadow-lg">
                <CardHeader>
                  <CardTitle>Domain Suggestions</CardTitle>
                  <CardDescription>
                    Based on your keywords: {keywords.join(", ")}. Our dodo is
                    proud of these finds! Sorted by brandability score — length,
                    pronounceability, hyphens, digits, ending and typo risk.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="all" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="available">Available</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all" className="space-y-4 mt-4">
                      {results.map((domain, i) => (
                        <div
                          key={i}
                          className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-lg gap-2"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{domain.name}</h3>
                              <ScoreBadge score={domain.score} />
                            </div>
                            <p
                              className={`text-sm ${
                                domain.status === "available"
                                  ? "text-green-600 dark:text-green-400"
                                  : domain.status === "taken"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {domain.status === "available"
                                ? "Available"
                                : domain.status === "taken"
                                  ? "Taken"
                                  : "Couldn't verify"}
                            </p>
                          </div>
                          <div className="flex items-center w-full sm:w-auto">
                            {domain.status === "available" && (
                              <div className="flex flex-col sm:flex-row gap-1 items-stretch sm:items-center w-full sm:w-auto">
                                <Button
                                  className={cn(
                                    REGISTRAR_COLORS.namecheap.bg,
                                    REGISTRAR_COLORS.namecheap.hover,
                                    REGISTRAR_COLORS.namecheap.text,
                                    "border-0 w-full sm:w-auto",
                                  )}
                                  size="sm"
                                  onClick={() =>
                                    openRegistrar(
                                      "namecheap",
                                      domain.affiliateLinks?.namecheap,
                                    )
                                  }
                                >
                                  Namecheap
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="ml-1"
                                  >
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                </Button>
                                <Button
                                  className={cn(
                                    REGISTRAR_COLORS.godaddy.bg,
                                    REGISTRAR_COLORS.godaddy.hover,
                                    REGISTRAR_COLORS.godaddy.text,
                                    "border-0 w-full sm:w-auto",
                                  )}
                                  size="sm"
                                  onClick={() =>
                                    openRegistrar(
                                      "godaddy",
                                      domain.affiliateLinks?.godaddy,
                                    )
                                  }
                                >
                                  GoDaddy
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="ml-1"
                                  >
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                    <polyline points="15 3 21 3 21 9" />
                                    <line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                    <TabsContent value="available" className="space-y-4 mt-4">
                      {results
                        .filter((d) => d.status === "available")
                        .map((domain, i) => (
                          <div
                            key={i}
                            className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 border rounded-lg gap-2"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium">{domain.name}</h3>
                                <ScoreBadge score={domain.score} />
                              </div>
                              <p className="text-sm text-green-600 dark:text-green-400">
                                Available
                              </p>
                            </div>
                            <div className="flex items-center w-full sm:w-auto">
                              {domain.status === "available" && (
                                <div className="flex flex-col sm:flex-row gap-1 items-stretch sm:items-center w-full sm:w-auto">
                                  <Button
                                    className={cn(
                                      REGISTRAR_COLORS.namecheap.bg,
                                      REGISTRAR_COLORS.namecheap.hover,
                                      REGISTRAR_COLORS.namecheap.text,
                                      "border-0 w-full sm:w-auto",
                                    )}
                                    size="sm"
                                    onClick={() =>
                                      openRegistrar(
                                        "namecheap",
                                        domain.affiliateLinks?.namecheap,
                                      )
                                    }
                                  >
                                    Namecheap
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="ml-1"
                                    >
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                      <polyline points="15 3 21 3 21 9" />
                                      <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                  </Button>
                                  <Button
                                    className={cn(
                                      REGISTRAR_COLORS.godaddy.bg,
                                      REGISTRAR_COLORS.godaddy.hover,
                                      REGISTRAR_COLORS.godaddy.text,
                                      "border-0 w-full sm:w-auto",
                                    )}
                                    size="sm"
                                    onClick={() =>
                                      openRegistrar(
                                        "godaddy",
                                        domain.affiliateLinks?.godaddy,
                                      )
                                    }
                                  >
                                    GoDaddy
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      className="ml-1"
                                    >
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                      <polyline points="15 3 21 3 21 9" />
                                      <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Adding SEO-friendly content sections */}
          <section className="mt-12 space-y-6 text-center max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold backdrop-blur-[1px] bg-background/30 py-1 rounded">
              How This Dodo-Powered Domain Generator Works
            </h2>
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <div className="space-y-2 backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <h3 className="font-medium">1. Connect Your Model</h3>
                <p className="text-muted-foreground">
                  Paste an API key from ChatGPT, Claude, Gemini or any other
                  provider. Google, Groq and Mistral all give one away free
                </p>
              </div>
              <div className="space-y-2 backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <h3 className="font-medium">2. Describe Your Project</h3>
                <p className="text-muted-foreground">
                  Add a few keywords, a short description, or both — either one
                  is enough to get started
                </p>
              </div>
              <div className="space-y-2 backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <h3 className="font-medium">3. Availability Check</h3>
                <p className="text-muted-foreground">
                  Every suggestion is checked against real registration records
                  so you only see domains you can register
                </p>
              </div>
            </div>
          </section>

          <Testimonials />

          <section className="mt-8 space-y-6 text-center max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold backdrop-blur-[1px] bg-background/30 py-1 rounded">
              Why Choose dodomains.dev
            </h2>
            <ul className="grid md:grid-cols-2 gap-4 text-left">
              <li className="flex gap-2 items-start backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <span className="text-primary">✓</span>
                <span>
                  Free to use, with no account and no upsell — you bring your
                  own API key and pay your provider directly, at their cost
                </span>
              </li>
              <li className="flex gap-2 items-start backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <span className="text-primary">✓</span>
                <span>
                  Works with any LLM: ChatGPT, Claude, Gemini, Grok, DeepSeek,
                  Mistral, Llama and any OpenAI-compatible endpoint
                </span>
              </li>
              <li className="flex gap-2 items-start backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <span className="text-primary">✓</span>
                <span>
                  Every suggestion checked against {REGISTERED_DOMAIN_COUNT}{" "}
                  registered domains worldwide, so you never fall for a name
                  that is already taken
                </span>
              </li>
              <li className="flex gap-2 items-start backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <span className="text-primary">✓</span>
                <span>
                  Highly creative domain suggestions beyond traditional
                  generators
                </span>
              </li>
              <li className="flex gap-2 items-start backdrop-blur-[1px] bg-background/30 p-2 rounded">
                <span className="text-primary">✓</span>
                <span>
                  Works inside your AI agent too — connect the{" "}
                  <Link href="/mcp" className="underline underline-offset-2">
                    MCP server
                  </Link>{" "}
                  and Claude or Cursor can check availability without leaving
                  the chat
                </span>
              </li>
            </ul>
          </section>

          <footer className="mt-16 pt-8 border-t text-center text-sm text-muted-foreground backdrop-blur-[1px] bg-background/30 p-2 rounded">
            <p>
              © {new Date().getFullYear()} dodomains.dev. {TAGLINE}.
            </p>
            {/* A second, plain-text path to /mcp for anyone who reads to the end. */}
            <p className="mt-2">
              Using an AI agent?{" "}
              <Link href="/mcp" className="underline underline-offset-2">
                Connect the MCP server
              </Link>
              .
            </p>
            <p className="mt-2">
              Built with ❤️ by{" "}
              <a
                href="https://x.com/redouane_cc"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                redouane
              </a>
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
