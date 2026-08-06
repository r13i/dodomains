import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Waves } from "@/src/components/ui/waves";
import { CopyButton } from "@/src/components/copy-button";
import {
  MCP_DESCRIPTION,
  MCP_ENDPOINT,
  MCP_TAGLINE,
  SITE_NAME,
  SITE_URL,
} from "@/src/lib/site";

export const metadata: Metadata = {
  title: `${SITE_NAME} MCP | ${MCP_TAGLINE}`,
  description: MCP_DESCRIPTION,
  alternates: { canonical: "/mcp" },
  openGraph: {
    title: `${SITE_NAME} MCP | ${MCP_TAGLINE}`,
    description: MCP_DESCRIPTION,
    url: `${SITE_URL}/mcp`,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} MCP | ${MCP_TAGLINE}`,
    description: MCP_DESCRIPTION,
  },
};

const CLAUDE_CODE_SNIPPET = `claude mcp add --transport http dodomains ${MCP_ENDPOINT}`;

const MCP_CLIENT_CONFIG = JSON.stringify(
  {
    mcpServers: {
      dodomains: {
        url: MCP_ENDPOINT,
      },
    },
  },
  null,
  2,
);

const TOOLS = [
  {
    name: "check_domains",
    what: "Checks up to 100 domain names at once against a snapshot of registered domains.",
    when: "After brainstorming candidate names, to filter out the ones already taken.",
  },
  {
    name: "score_domain",
    what: "Scores a domain 0-100 on brandability — length, pronounceability, hyphens, digits, TLD tier and typo risk.",
    when: "To break ties between candidates that already passed the availability check.",
  },
  {
    name: "get_registration_links",
    what: "Returns GoDaddy and Namecheap registration URLs for a domain.",
    when: "Once the user has picked a name and wants to register it.",
  },
];

export default function McpPage() {
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

        <div className="max-w-5xl mx-auto space-y-8 relative z-10">
          <header className="text-center space-y-4">
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24 mb-2">
                <Image
                  src="/logo-backgroundless.png"
                  alt="dodomains logo"
                  fill
                  priority
                  className="object-contain"
                />
              </div>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold max-w-2xl mx-auto backdrop-blur-[1px] bg-background/30 px-2 py-1 rounded">
              {MCP_TAGLINE}
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto backdrop-blur-[1px] bg-background/30 px-2 py-1 rounded">
              {MCP_DESCRIPTION}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-2xl mx-auto">
              <div className="w-full overflow-x-auto rounded-md border bg-background/80 backdrop-blur-sm px-3 py-2">
                <code className="font-mono text-sm whitespace-nowrap">
                  {MCP_ENDPOINT}
                </code>
              </div>
              <CopyButton value={MCP_ENDPOINT} label="Copy endpoint" />
            </div>
          </header>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-center backdrop-blur-[1px] bg-background/30 py-1 rounded">
              Set it up
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="min-w-0 backdrop-blur-sm bg-background/80 border-opacity-50 shadow-lg">
                <CardHeader>
                  <CardTitle>Claude Code</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3">
                  <div className="min-w-0 overflow-x-auto rounded-md border bg-muted/40 p-3">
                    <pre className="font-mono text-xs">
                      {CLAUDE_CODE_SNIPPET}
                    </pre>
                  </div>
                  <CopyButton
                    value={CLAUDE_CODE_SNIPPET}
                    label="Copy command"
                  />
                </CardContent>
              </Card>

              <Card className="min-w-0 backdrop-blur-sm bg-background/80 border-opacity-50 shadow-lg">
                <CardHeader>
                  <CardTitle>Claude Desktop</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3">
                  <div className="min-w-0 overflow-x-auto rounded-md border bg-muted/40 p-3">
                    <pre className="font-mono text-xs overflow-x-auto">
                      {MCP_CLIENT_CONFIG}
                    </pre>
                  </div>
                  <CopyButton value={MCP_CLIENT_CONFIG} label="Copy config" />
                </CardContent>
              </Card>

              <Card className="min-w-0 backdrop-blur-sm bg-background/80 border-opacity-50 shadow-lg">
                <CardHeader>
                  <CardTitle>Cursor</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Add to <code className="font-mono">.cursor/mcp.json</code>
                  </p>
                  <div className="min-w-0 overflow-x-auto rounded-md border bg-muted/40 p-3">
                    <pre className="font-mono text-xs overflow-x-auto">
                      {MCP_CLIENT_CONFIG}
                    </pre>
                  </div>
                  <CopyButton value={MCP_CLIENT_CONFIG} label="Copy config" />
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-center backdrop-blur-[1px] bg-background/30 py-1 rounded">
              What it gives your agent
            </h2>
            <Card className="backdrop-blur-sm bg-background/80 border-opacity-50 shadow-lg">
              <CardContent className="divide-y">
                {TOOLS.map((tool) => (
                  <div key={tool.name} className="py-4 first:pt-0 last:pb-0">
                    <h3 className="font-mono text-sm font-medium">
                      {tool.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tool.what}
                    </p>
                    <p className="text-sm text-muted-foreground">{tool.when}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="max-w-3xl mx-auto">
            <Card className="backdrop-blur-sm bg-background/80 border-opacity-50 shadow-lg">
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    A note on availability:
                  </span>{" "}
                  &quot;Available&quot; means the domain is not present in our
                  snapshot of registered domains — it is not a live,
                  authoritative registry or WHOIS check. Confirm at a registrar
                  before relying on it.
                </p>
              </CardContent>
            </Card>
          </section>

          <footer className="text-center text-sm">
            <Link
              href="/"
              className="text-primary hover:underline underline-offset-4"
            >
              Prefer the web app? Go back home →
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
