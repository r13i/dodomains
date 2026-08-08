# dodomains.dev 🦤

Free dodo-powered domain name generator using LLMs. Bring your own API key from ChatGPT, Claude, Gemini or any provider.

![dodomains.dev](public/logo-backgroundless.png)

## ✨ Features

- **Free to Use** - No account, no upsell. You bring your own API key and pay your provider directly, at their cost
- **Bring Your Own Key** - Works with OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, xAI, OpenRouter, or any OpenAI-compatible endpoint
- **Available Domains Only** - Verified against existing domain records
- **Highly Creative Suggestions** - Beyond traditional domain generators

## 🔌 MCP Server

dodomains also speaks [MCP](https://modelcontextprotocol.io), so your AI agent can check domain availability without leaving the chat.

- **Endpoint:** `https://dodomains.dev/api/mcp`
- **Claude Code:**
  ```bash
  claude mcp add --transport http dodomains https://dodomains.dev/api/mcp
  ```
- **Cursor** (`.cursor/mcp.json`):
  ```json
  {
    "mcpServers": {
      "dodomains": {
        "url": "https://dodomains.dev/api/mcp"
      }
    }
  }
  ```
- **Claude Desktop:** Settings → Connectors → Add custom connector, name it `dodomains`, paste `https://dodomains.dev/api/mcp`. Custom connectors require a paid Claude plan.
- **Tools:**
  - `check_domains` - Checks up to 100 domain names at once against a snapshot of registered domains
  - `score_domain` - Scores a domain 0-100 on brandability
  - `get_registration_links` - Returns GoDaddy and Namecheap registration URLs for a domain

See [dodomains.dev/mcp](https://dodomains.dev/mcp) for full setup instructions. The dodo does not judge your naming choices, but the brandability score might.

## 🚀 Getting Started

### Prerequisites

- Node.js 22.x or later
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:

```bash
git clone https://github.com/r13i/dodomains.git
cd dodomains
```

2. Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

3. Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Environment

No LLM key is needed to run the app — visitors bring their own and it never touches the server. The only variables the server needs are:

- `DATABASE_URL` - Postgres connection string
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog project API key
- `NAME_COM_USERNAME` / `NAME_COM_TOKEN` - name.com Core API credentials for live availability checks (without them, results fall back to the snapshot and show "Couldn't verify" instead of "Available")

## 🛠️ How It Works

1. **Enter Your Keywords** - Provide keywords and a brief description of your project
2. **Bring Your Own Key** - Paste an API key for the model you connect (OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, xAI, OpenRouter, or any OpenAI-compatible endpoint) and it generates the domain suggestions
3. **Availability Check** - We verify domain availability in real-time so you only see domains you can register

## 🧩 Tech Stack

- [Next.js](https://nextjs.org) - React framework
- [Tailwind CSS](https://tailwindcss.com) - Utility-first CSS framework
- [shadcn/ui](https://ui.shadcn.com) - Re-usable components
- [Geist Font](https://vercel.com/font) - Optimized font family

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 👨‍💻 Built with ❤️ by [redouane](https://x.com/redouane_cc)

---

© dodomains.dev. Free dodo-powered domain name generator using LLMs.
