# dodomains.dev — Registered-Domain Data Source Report

**Date:** 2026-08-06 · **Scope:** replacing/backing the `domains` Postgres snapshot behind `src/lib/domains.ts:checkAvailability`
**Constraint recap:** free product, GoDaddy/Namecheap CJ affiliate revenue, hobby budget (<$50/mo preferred), 10–30 candidates/request, <300 ms, 2 vCPU/2 GB Postgres VM.

---

## 0. The finding that reframes everything

Your app offers **27 distinct TLDs** (`src/app/page.tsx:34-46`):

| Group | TLDs |
|---|---|
| POPULAR | com net org **io co** app dev **ai** |
| CREATIVE | **ai io co me** app xyz tech design |
| COUNTRY | **us uk ca eu de fr jp au** |
| SPECIALTY | store shop blog online site **web** digital cloud |

**15 are gTLDs** (obtainable in bulk via ICANN CZDS). **12 are ccTLDs** (`io co ai me us uk ca eu de fr jp au`) — and for **8 of those 12 there is no bulk registered-domain source at any price**, from any vendor, ever. `.de` (DENIC), `.nl`, `.ca` (CIRA), `.dk` all explicitly refuse; `.io`, `.co`, `.ai`, `.me`, `.eu`, `.jp`, `.au` publish nothing.

Because `checkAvailability` treats "not in snapshot" as available, **any TLD you don't have data for reports 100% available.** `.io`, `.co`, `.ai` and `.me` are exactly what an LLM emits for startup names. That is the single largest accuracy defect in the current design — far bigger than the zone-file delegation gap everyone worries about.

The good news: **RDAP covers 23 of your 27 TLDs for free, in real time.** Only `.co` and `.me` have no working RDAP endpoint (verified), plus `.eu` and `.jp` (unverified). That makes a snapshot-plus-RDAP hybrid the obvious shape.

---

## 1. TL;DR — the 3 realistic options

| # | Option | What it is | Price |
|---|---|---|---|
| **1** | **Snapshot + RDAP confirm** ← recommended | Keep Postgres as a fast negative pre-filter (CZDS free, or domains-monitor $9/mo). Confirm only the candidates that *look available* via free registry RDAP before rendering an affiliate link. | **$0–9/mo** data + ~$24/mo VM upgrade for disk |
| **2** | **No snapshot at all** | Delete the `domains` table. Answer live from RDAP (23/27 TLDs) + a free registrar API (Spaceship or name.com, no spend gate) for the rest. Zero storage, zero ingest ops. | **$0/mo** |
| **3** | **Buy the answer** | Fastly Domain Research API (ex-Domainr) as the single source of truth — registry-precise, premium/reserved-aware. 10,000 free checks/mo, then $0.001. | **$0/mo → $20/mo at 30k checks; $90/mo at 100k** |

Everything else is either a worse version of one of these or fails on licence.

---

## 2. Full comparison table — all sources, sorted by fit

### 2A. Bulk snapshot sources (feed the `domains` table)

| Source | What you get | Coverage | Freshness | Price | Reliability | Licence OK for a public free tool? |
|---|---|---|---|---|---|---|
| **ICANN CZDS** | gTLD zone files (delegated names) | ~1,151 gTLD zones, ~252.5M names. Covers 15/27 of your TLDs. **Zero ccTLDs** | Daily, 1 download/24h; 0–30 h stale | **Free** (per-TLD approval, weeks) | **High** — registry's own zone data; endpoints verified live | **Probably.** §1.6 permits redistribution "incorporated into a value-added product… that does not permit extraction of a substantial portion". §1.1(1)/§1.3 forbid marketing use of the *Data*. Read before shipping |
| **domains-monitor.com** | Domain lists + daily new/removed deltas, API | 343,124,614 in 1,570 zones (gTLD zones + crawled ccTLDs) | Daily, 8-hourly refresh cycle | **$9/mo** Standard | **Med-High** — Munich address, no company reg. no.; reviews report noisy deltas; ccTLD data is crawl-derived | **YES, explicitly.** "granted a non-exclusive right to use the data for any lawful purpose, including commercial use" + derived-product clause. Best licence in the paid category |
| **Nominet .uk** | Zone files **and a full registered-domain list** (incl. suspended + no-NS) | .uk .co.uk .org.uk .me.uk .ltd.uk .plc.uk .net.uk .sch.uk, ~10–11M | 1 transfer/24 h | **Free** ("The service is currently provided free of charge") | **High** — registry data, no delegation gap at all | **Unread** — T&C page 403s to fetchers. No CZDS-style value-added carve-out found. Read in a browser |
| **AFNIC .fr** | Monthly full registry list + daily creation files | .fr (+ .re .pm .tf .wf .yt), 4M+ | Monthly (lands ~15th, currently 202606) + daily CREA | **Free** | **High** — registry data, no delegation gap | **YES.** Licence ouverte: "may be reused, including for commercial purposes, without a licence and without payment of royalties" (attribution required) |
| **domainmetadata.com** (arndt.ai GmbH) | CSV lists: all-known / **active** / newly-registered | 373,428,101 active (.com 167.4M matches reality) | Multiple/day (.com stamped today) | **$9.90/mo billed yearly ≈ $119 up front** | **Med-High** — only sub-$50 vendor with a named legal entity | **Unstated.** ToS exists but no data-licence clause. A real GmbH means you can get a written answer |
| **IIS .se / .nu** | Open AXFR zone transfer | 1,424,331 + 194,476 = 1.62M | **Hourly** — best in class | **Free**, no key | **High** — public since 2016; ~4% delegation gap (unverified) | **YES.** CC BY 4.0. Contact hostmaster@iis.se first |
| **SK-NIC .sk** | `domains.txt`, full registry incl. no-NS | 485,434 rows; 0.517% have empty NS | Daily (header dated today) | **Free** | **High** data | **UNRESOLVED** — no licence text anywhere |
| **whoisextractor.com** | Domain names only, one per line, ZIP | 342,957,888 / 1,570 TLDs | Daily | **₹3,000/mo ≈ $31.53** | **Med** — counts within 0.05% of domains-monitor ⇒ probable resale; WhatsApp support; INR FX risk | **Unstated** |
| **Traficom .fi** | OData API, full registry records | 450,426 rows / 447,972 Registered | Live | **Free**, no key | **Med** — **legal persons only**, ~19% of .fi structurally absent | **Unconfirmed** (other datasets on the page are CC BY 4.0). GDPR: store only `Name` |
| **zonestats.io** | Domain lists + API | 362,960,571 | Daily | **€39/mo** | **Med** — anonymous operator; within 10 domains of NetAPI ⇒ same operator | **Unstated** |
| **allzonefiles.io** (SoftDev LLC, WA) | All zonefiles + new/expired lists, REST API | 379,371,547 / 1,581 zones | Daily | **$39/mo** | **Med** — real US entity (UBI 605 367 903), founded 2023, no SLA | **NO affirmative grant.** "You may not reproduce, redistribute, or exploit any content without prior written permission" |
| **WhoisDS free NRD** | Daily newly-registered-domain lists | Delta only, ~70k/day (unverified) | Daily | **Free** (paid domains-only tier $60/mo) | **Med** — single un-CDNed host; free list is a subset | **YES** — "may be reused, including for commercial purposes, without a license and without any payment" |
| **netapi.com** | Same lists as zonestats + metadata | 362,960,561 / 1,372 TLDs | Daily | **€49/mo** | **Med** — same operator as zonestats at €10 more/tier | **Unstated**; bundles scraped emails/phones (GDPR) |
| **CISA dotgov-data** | Full .gov register, CSV on GitHub | 16,442–47,606 rows | Daily | **Free** | **High** — CISA operates the registry | **YES**, CC0. **But .gov is not publicly registrable — product value ≈ 0** |
| **allregistered.domains** | gzip lists, optional NS | 343,007,534 / 3,385 "zones" | gTLD daily; **ccTLD monthly** | **$49.99/mo or $419/yr** | **Low** — gmail + Telegram contact, no entity, 2022 footer | Unstated. **ccTLD monthly refresh is disqualifying** |
| **webatla** | zstd JSONL, download API | 408,896,546 / 1,435 TLDs | Daily | **€29/mo** | **Med** — best price/row, anonymous EU operator; count exceeds every zone vendor ⇒ possible contamination | **NO.** Forbids building "a service or product that competes with webatla using our data" ; permitted uses are analytical only |
| **Domains Index** | One-time bulk + update sub | 255,003,531 (~25% short of reality) | Sub from $25/mo | $139 gTLD / $998 all + $25/mo | **Low** — 2018–19 copyright, empty free-download pages | Unstated |
| **NetworksDB** | Zipped lists, one-time purchase | 355,144,327 — **resolving domains only** | ~Monthly snapshot | $230 one-time (all) | **Low fit** — "domain names that… resolve to at least one IPv4 or IPv6 address" excludes every parked/held/fresh name | Unstated. **Structurally wrong shape** |
| **Switch .ch/.li** | TSIG AXFR (key published openly) | ~2.6M + ~85k | Daily, 1/24 h | Free | High data | **NO.** Purpose-limited to "combating cybercrime, scientific and social research or… public interest". Affiliate product does not qualify |
| **OpenINTEL** | Daily FDNS + ccTLD apex lists | 307 ccTLDs, ~308M domains/day; but .de list = 9,439,040 vs DENIC 17,663,886 = **53% coverage** | Daily / weekly Mondays | Free | High operator, poor as a registration proxy | **NO.** CC BY-NC-SA 4.0, non-commercial. No commercial-licence offer exists on their terms page |
| **HF humbleworth/registered-domains** | Single 4.1 GB text file, 255,097,510 apexes | 1,274 TLDs, 0 IDNs | **~2022 vintage** (5% of it is dead Freenom .tk/.ml/.ga/.cf/.gq) despite a 2025 upload date | Free | **Low** — most convenient file, worst vintage | **No licence declared** |
| **domains-project (tb0hdan)** | Git-LFS xz dumps | 1.77B *hostnames*, not apexes | `data/` untouched since **2022-09-21** | Free / Patreon | **Low** — one-person project, personal PayPal/IBAN | BSD-3-Clause on the repo; data provenance mixed |
| **Common Crawl columnar index** | `url_host_registered_domain` in Parquet | 33,290,596 registered domains = **8.3%** of 401.6M | Every 4–6 weeks | Free (Athena costs yours) | High org, ~92% false-available if used alone | Permissive |
| **Common Crawl web graph** | 121.1M domain nodes, 3.9B edges | ~30% of registered set; includes dead link targets | Quarterly | Free | Best crawl coverage, still 70% false-available | Permissive |
| **crt.sh / CertStream (CT logs)** | Cert-observed names; 73 TB Postgres / WS firehose | gTLDs included (unlike OpenINTEL lists) but cert ≠ registration | Real-time | Free | **Low** — crt.sh returned HTTP 502 during checks; 73 TB is not extractable | No licence published |
| **Kaggle 171M domains** | CT-derived list + DNS/DNSSEC | 171,212,578 — author says "about half of all domains" | One-off, stale | Free | **Low** — CT bias excludes parked/unhosted names | Unreadable from page (unverified) |
| **Majestic Million** | Top 1M root domains, daily CSV | 1M = **0.25%** of registered set | Daily (verified today) | Free | High as a *popularity* list | **YES**, CC BY 3.0. Only useful as a "definitely taken" overlay |
| **Tranco / Umbrella / CrUX / Cloudflare Radar / DomCop** | Top 1M–10M lists | 0.25%–2.5% coverage | Daily–monthly (DomCop last refreshed **2026-03-29**) | Free | Wrong shape entirely | Mixed/absent licences |
| **Rapid7 Project Sonar FDNS** | Bulk forward DNS | Historically the go-to corpus | **Public access closed 2022-02-10** | Paid, price on application | High data | **NO** — licence restricts to "legitimate cybersecurity purposes", excludes marketing/lead-gen |
| **DNS-OARC Zone File Repository** | com/net/org/info/biz/name/asia/aero zones, weekly, back to 2009 | Exactly the gTLDs you want | Weekly | **Members-only**, fee not published | High | **NO** — research-scoped, membership contract. Go to CZDS instead |
| **Whoxy bulk DB** | 711,303,138 domains / 2.99B WHOIS records | Historical archive — ~2× the real universe | Snapshot + $1.5k–4.5k/yr updates | **$10,000** one-time | High vendor | Unstated. Archive shape ⇒ mass false-**taken** |
| **WhoisFreaks bulk** | Active-domains DB + segments | 931.1M total / 683.7M active / 1,529 TLDs | Daily/weekly/monthly | Full DB quote-only; cheapest segment **$2,500** (.top/.de) | High | Unstated. 100×+ budget |
| **WhoisXML API bulk** | WHOIS DB download + NRD feed | 374M active, 7,596 TLDs | **Quarterly** bulk | **Quote-only** (never published) | Highest vendor durability | Negotiated. Quarterly = wrong cadence |
| **DomainTools / Farsight DNSDB** | Passive DNS + Iris | Largest passive-DNS DB; **no registered-domain list product** | Real-time | **£12,600–£126,000/yr** (G-Cloud 14, 2024, unverified-current) | Very high, wrong product | Enterprise contract |
| **SecurityTrails, Netlas, DataForSEO, CIRCL, mnemonic, IA CDX, DNS Census 2013, domainsdb.info** | Query APIs / OSINT / archives | None provide a complete registered-domain snapshot; Netlas caps downloads at 10M even at $830/mo; DNS Census is 13 years old; domainsdb.info now requires an API key | — | $0–$1,500/mo | **Low fit** | Mostly unstated |
| **.us / .pt / .nz / .edu / .post / .mil / .int** | Application-gated or refused ccTLD/sTLD zones | Individually tiny or restricted | — | Not published | n/a | Research/security-purpose framing; commercial checker won't qualify |
| **.de (DENIC) / .nl (SIDN) / .dk (Punktum) / .ca (CIRA) / .au / .jp / .eu / .io / .co / .ai / .me** | **Nothing** | Collectively tens of millions of domains, incl. 4 of your headline TLDs | — | **No access at any price** | n/a | n/a — DENIC verbatim: "DENIC does not hand over these zone files (or parts of it) to any third parties" |
| **Small open-AXFR ccTLDs** (cd cv er fj gp mp mw ni sl, +.do) | Accidental open zone transfers | <100k domains total, none relevant | Ad hoc | Free | **Low** — 1-in-3 success rate observed even on the best-documented (.ee) | **No licence.** Open by misconfiguration ≠ permission |
| **DNSSEC NSEC zone walking** | Enumerate signed zones | Only tiny TLDs; every big TLD uses NSEC3/opt-out | On demand | Free in money | **Low** | **No permission.** Do not do this for a commercial product |

### 2B. Per-query availability sources (confirm layer, or replace the snapshot)

| Source | What you get | Coverage | Freshness | Price | Reliability | Licence OK? |
|---|---|---|---|---|---|---|
| **RDAP, self-hosted via IANA bootstrap** | 200 = registered, 404 = not | `dns.json` v2026-07-23: 1,200 TLDs. **23/27 of your TLDs** work (`.io`,`.de`,`.us` need hardcoded overrides). `.co`,`.me` have no working RDAP; `.eu`,`.jp` unverified | **Real-time** — .com RDAP update actual 17.76 s | **Free**, no key | **High data / Med ops.** Measured: .com 0.13 s, .dev 0.23 s, .xyz 0.22 s, .io 0.80 s, .org 0.76 s, .top 0.71 s, .online 0.78 s, **.shop 1.16 s**. 20 sequential Verisign queries → 0× HTTP 429 | **Amber.** Verisign/Identity Digital RDAP terms forbid "high volume, automated… processes… except as reasonably necessary to register domain names". Low volume is tolerated in practice |
| **Spaceship API** | Bulk availability | All TLDs Spaceship sells | Real-time | **Free — no spend/domain gate** | **High fit.** `POST /v1/domains/available` takes **20 domains**; 30 req/30 s ⇒ ~1,200 domains/min. No IP whitelisting | Not published; docs point to support |
| **name.com Core API v1** | Availability + price + `premium` flag | All name.com TLDs | Real-time | **Free**, no gate | **High fit.** **50 domains per call**, 20 req/s. Real sandbox. Partners incl. Vercel/Netlify | API Access Agreement; nothing forbidding a public checker |
| **Fastly Domain Research (ex-Domainr)** | `Status` with a full vocabulary: available / **reserved / dpml / premium / priced / parked** | Broadest TLD reach; the only non-registrar source that flags premium & reserved | Real-time | **10,000 free/mo, then $0.001** Status-Precise (`fastly.com/pricing`). Note the docs page still says pricing is unpublished — trust the pricing page | **High** — Fastly, public company. 30 s platform runtime cap; `unknown`/`undelegated` must be treated as "not available" | Fastly ToS. Canonical use case |
| **Cloudflare Registrar `domain-check`** | Availability + at-cost price | **20 domains/request**, but API-enabled TLD subset only | Real-time | Free | **Med** — beta since 2026-04-15, no documented rate limits, requires a billing profile + payment method just to check | No restriction found. **But Cloudflare has no affiliate program — zero revenue** |
| **Namecheap `domains.check`** | Availability + `IsPremiumName` + premium price + `IcannFee` | All Namecheap TLDs (incl. .io/.co/.ai/.me) | Real-time | Free API, **but gate: 20 domains OR $50 balance OR $50 spent/2 yrs** | **Med-High.** 50/min, 700/hr, **8,000/day**; batch 50/call ⇒ ~8,000 user requests/day. **IPv4-only IP whitelist** (breaks serverless) | ToS; drop-catching banned. You already earn 20% Namecheap affiliate — natural pairing |
| **GoDaddy Domains API v3** | Availability + real sale price | All GoDaddy TLDs | Real-time (cached by default) | Free, **gate: 50+ domains or ≥$20/mo spend** | **Med.** 600 req/~23 min ≈ 26/min, **single domain per call**, no batch. GoDaddy cut small-account API access with ~1 day notice in 2024 | No prohibition found. **Ask your CJ affiliate contact whether the affiliate relationship unlocks it** |
| **WhoisJSON** | RDAP-backed availability API | Broad | Real-time | **Free 1,000/mo @20 rpm; $10/mo 30k @40 rpm; $30/mo 150k @60 rpm; $50/mo 1M @100 rpm** | **Med** — small vendor, no SLA | **YES, explicitly:** "All plans, including the free Basic plan, allow commercial use" |
| **rdapapi.io** | Normalized RDAP proxy (bootstrap, backoff, 429 handling done for you) | Claims 1,200+ TLDs = **inherits the exact same gaps** (no .io/.co/.me) | Real-time | $9/mo 30k @30 rpm; $49/mo 200k @60 rpm | **Low-Med** — newest, least proven vendor here | Not published |
| **WhoAPI** | Availability API | "Top gTLDs & ccTLDs"; +1 TLD/month on higher tiers | Real-time | $23/mo 40k; $49/mo 200k | **Med** — since ~2011; SLA only from $99/mo. **No rate limits published** | Not published |
| **APILayer Whois** | WHOIS-parsed availability | Not stated | Real-time | **Free 3,000/mo; $4.99/mo 150,000** | **Low-Med.** $0.000033/req is ~30× cheaper than Fastly ⇒ likely cached/DNS-inferred. Uses "rotating IP addresses" | Marketplace terms permit commercial use |
| **WhoisFreaks API** | Availability + bulk | 1,529 TLDs claimed | Real-time | 500 free credits; **$75/mo** 50k (or $63/mo annual) | **Med.** Flat 80 rpm live. Their docs admit a 100-domain bulk call takes **16 s – 1 min** | Not published |
| **IP2WHOIS / IP2Location.io** | WHOIS lookups | 1,221 TLDs claimed | Real-time | Free 500/mo; **$49/mo for only 5,000** = $0.0098/check | Med vendor, brutal price cliff | Not published. Sanity-check tool only |
| **rdap.org** | Bootstrap redirect service | Everything in the bootstrap | Real-time | Free (donations) | **Low for production** — run by one person (Gavin Brown) in personal time. Cloudflare limit **10 requests / 10 seconds** | No ToS. Dev/debug only |
| **Port-43 WHOIS** | Free-text availability | The last resort for `.co` / `.me` | Real-time | Free | **Low.** ICANN dropped the port-43 obligation 2025-01-28; 374 gTLDs had disabled it by Sept 2025 (unverified). Parsing is per-TLD heuristics that break silently | Same restrictive registry terms |
| **Porkbun `checkDomain`** | Availability + price + `premium` | All Porkbun TLDs | Real-time | Free | **Disqualified** — "Default is **1 check per 10 seconds** per account" ⇒ 20 candidates = 200 s | — |
| **Dynadot / NameSilo / Gandi / Vercel / Route 53 / OpenSRS / Openprovider / Internet.bs / Sav / Domainee** | Registrar availability endpoints | Varies | Real-time | Mostly free w/ account | Dynadot: **1 in-flight request per account** (fatal for multi-user). NameSilo/Gandi/Openprovider/Internet.bs: docs unverifiable (403/empty). Route 53: 50 burst/10 rps, no batch, us-east-1 only. Domainee: **500 req/day per IP** shared across all your users | Mostly unstated |
| **EPP `domain:check`** | Registry ground truth, ~10s of ms | Per-registry | Real-time | **~$3,500 app + $4,000/yr ICANN + ~$70k working capital** (unverified) | Maximum | The one path where a public checker is unambiguously legitimate. Out of scope at hobby scale |
| **Google Cloud Domains / Squarespace** | — | — | — | — | **DEAD.** Google Domains sold to Squarespace (closed 2023-09-07); Squarespace exposes no registrar API | — |

### 2C. Price-display sources (optional — helps affiliate conversion)

| Source | Coverage | Freshness | Price | Licence to republish? |
|---|---|---|---|---|
| **Porkbun `pricing/get`** | 907 TLDs, register/renew/transfer, no auth | Live | **Free** | Not published (public unauthenticated endpoint) |
| **TLD-List Starter** | Cheapest price per TLD across ~56 registrars, JSON/CSV download | Not published | **$9/mo** (from a 2026-03-26 snapshot; live page Cloudflare-403s — **unverified-current**) | **YES** — "No Restrictive Licensing — Use and republish the data however you want" |
| **TLDSpy Pro** | 3,464 TLDs × 37 registrars + 100-domain bulk availability | Timestamped, history since Feb 2025 | **$16/mo** (10,000 credits — credit cost per endpoint undisclosed) | Not published |
| **tldes.com** | 151 registrars, hourly | **Verified hourly** (status endpoint showed 2026-08-06T14:17:37Z) | **$50/mo or $300/yr** | Explicitly allows "Creating domain price comparison websites"; forbids reselling raw data |
| **tldlist.us** | 123 TLDs, one indicative price each | Last updated 2026-06-20 | Free | "CC BY 4.0-**style**" self-worded grant, not the actual instrument |
| **Apify TLD-List scraper** | Scrapes tld-list.com | On demand | $0.65/1,000 results | **No licence to the data.** 0 monthly users. Avoid |

---

## 3. Reliability ranking

### ✅ Trustworthy — build on these

| Source | Why |
|---|---|
| **ICANN CZDS** | The registry's own zone data. Presence in a zone is *proof* of registration ⇒ false-taken ≈ 0. Endpoints verified live. Only weakness is the delegation gap and 24 h cadence. |
| **Registry RDAP (Verisign, Identity Digital, Google Registry, CentralNic, PIR)** | Ground truth, same data every commercial API resells. Verisign's ICANN-reported RDAP update actual is **17.76 seconds**; RDAP availability 100%/month against a 98% SLA. 20-query burst produced zero 429s. |
| **Nominet .uk, AFNIC .fr, IIS .se/.nu, SK-NIC .sk, CISA .gov** | National registries publishing their own register. `.uk`, `.fr`, `.sk` publish the **full registration list** including non-delegated names — no delegation gap at all. `.se`/`.nu` refresh hourly. |
| **Fastly Domain Research, name.com, Spaceship** | Real companies, registry-backed answers, published limits, and (for name.com/Spaceship) no spend gate. Fastly is the only source that distinguishes *available* from *reserved* from *premium* from *parked*. |
| **ICANN Monthly Registry Reports** | The authoritative per-gTLD registered count (`Totals` row of `<tld>-transactions-YYYYMM-en.csv`). Use this — not ntldstats — to measure your snapshot's true gap. |

### ⚠️ Usable with caveats

| Source | The caveat |
|---|---|
| **domains-monitor.com ($9/mo)** | Best licence and best price in the paid tier, but ccTLD coverage is **crawl-derived, not registry-derived**, and third-party reviews report noisy new/removed deltas. Confirm before paying that Standard includes *full* lists, not just deltas. |
| **domainmetadata.com ($119/yr)** | Use the **"active"** list (373.4M), never the "all known" list (809.4M) — its `.com` known bucket is 334.9M vs 167.4M real, so loading "known" would mark ~half of all genuinely free `.com` names as taken. Billed yearly, not monthly. |
| **Traficom .fi** | Registry-sourced and free, but **legal persons only** — private individuals are structurally excluded ⇒ ~19% false-available on `.fi`, skewed toward exactly the personal/brandable names you generate. Licence unconfirmed. |
| **Namecheap / GoDaddy APIs** | Excellent data, but gated on $50 balance / 50 domains respectively, and Namecheap requires **IPv4-only IP whitelisting** — you'd need to proxy through the Postgres VM. |
| **WhoisJSON ($10–50/mo)** | Explicit commercial-use grant on every tier, which is rare. But the *rate* limit binds, not the quota: at 20 rpm on the free tier, **one user checking 30 candidates exceeds your per-minute budget**. |
| **whoisextractor / zonestats / netapi** | Right data shape, right price band, but anonymous or near-anonymous operators with **no published data licence at all**. |
| **WhoisDS free NRD** | Genuinely commercially reusable and free — but it is a **delta feed only**. It maintains a snapshot; it cannot create one. Only a few days of history are exposed, so a missed cron run leaves a permanent hole. |
| **rdap.org** | Perfect for development and manual debugging. **10 requests / 10 seconds** and a single volunteer operator make it unusable in your request path — one user search would blow the budget 3×. |
| **Majestic Million** | Clean CC BY 3.0 and daily, but 1M / 401.6M = **0.25% coverage**. Only sane use is a "definitely taken" overlay. |

### 🛑 Avoid

| Source | Why |
|---|---|
| **OpenINTEL** | **CC BY-NC-SA 4.0, non-commercial.** Affiliate revenue is commercial use, and their terms page contains no commercial-licensing offer. Also only ~53% coverage on `.de`. Technically the most tempting thing here; legally closed. |
| **Switch .ch/.li** | Purpose-limited by Swiss ordinance to cybercrime/research/public interest. They reserve the right to **block your whole IP prefix**. |
| **Rapid7 Sonar FDNS** | Free access closed 2022-02-10; the commercial licence explicitly excludes non-security uses like marketing. Any free copy you find is ~5 years stale. |
| **webatla** | Terms forbid building a product that competes using their data; permitted uses are analytical only. |
| **NetworksDB** | **Resolving-only.** Every parked, held, defensively-registered and freshly-bought domain is absent ⇒ mass false-available on exactly the brandable names an LLM emits. |
| **allregistered.domains** | ccTLDs refreshed "at least once a month" ⇒ up to a month of new ccTLD registrations all reported available. |
| **HuggingFace humbleworth, domains-project, Kaggle 171M, DNS Census 2013** | All ~2022 or older, or ~50% coverage by the author's own admission. 5% of the humbleworth corpus is dead Freenom `.tk/.ml/.ga/.cf/.gq`. Every domain registered since is a false "available". |
| **Common Crawl (index or web graph), CT logs, passive DNS** | Observation-derived. 8.3% / 30% / ~50% coverage respectively. Certificates and crawls are proxies for *use*, not *registration*. |
| **Whoxy, WhoisFreaks, WhoisXML, DomainTools, SecurityTrails, Netlas** | $2,500–$126,000. WHOIS-archive shape (Whoxy 711M vs a 401.6M real universe) produces mass false-**taken**. Wrong price, wrong shape. |
| **Porkbun API, Dynadot API, Domainee, DomCop, domainsdb.info, unintentional open AXFR, NSEC walking** | Rate limits 200× too slow, one-request-at-a-time concurrency, 500/day shared across all users, 4-month-stale data, API-key gates, or no permission at all. |
| **ntldstats.com** | Its per-TLD counts are inflated ~1.4–1.6× vs ICANN's registry reports (.xyz 11.96M vs 8.68M). Do not size anything from it. |

---

## 4. Price summary

### (a) gTLD-only coverage — 15 of your 27 TLDs

| Path | Monthly |
|---|---|
| **ICANN CZDS** (request only the 15 gTLDs you offer) | **$0** data. Cost is weeks of per-TLD approvals + renewal tracking |
| **domains-monitor.com Standard** — no approvals, one download | **$9** |
| **domainmetadata.com Basic** (active list) | **$9.90** billed yearly = **$119 up front** |
| VM disk to hold it (see §6) | **+$18/mo** to move from a 40 GB to an 80 GB DigitalOcean droplet ($6 → $24) |

**Cheapest honest gTLD path: $0/mo (CZDS) + $18/mo disk = $18/mo.** If you value your weekends more than $9: **$27/mo** with domains-monitor.

### (b) gTLD + major ccTLD coverage

There is no complete path. Assemble it:

| Component | Covers | Monthly |
|---|---|---|
| CZDS or domains-monitor | 15 gTLDs | $0–9 |
| Nominet full registry list | `.uk` | $0 |
| AFNIC open data | `.fr` | $0 |
| IIS AXFR | `.se`, `.nu` (not in your picker) | $0 |
| **Nothing exists for** `.io .co .ai .me .us .ca .eu .de .jp .au` | 10 of your 27 | — |
| ⇒ RDAP fills 8 of those 10 for free; `.co` and `.me` need a registrar API (Spaceship/name.com, free) | | **$0** |

**Total: $0–9/mo + $18/mo disk.** The ccTLD hole is closed by RDAP + a free registrar API, **not** by buying a bigger snapshot. No vendor at any price sells you registry-grade `.io`/`.co`/`.ai`/`.me`.

### (c) Real-time per-query, no snapshot at all

| Path | 1,000 user requests/mo | 5,000/mo | 30,000/mo |
|---|---|---|---|
| **RDAP self-hosted + Spaceship/name.com for `.co`/`.me`** | **$0** | **$0** | **$0** (limited by registry goodwill, not billing) |
| **Fastly Status-Precise** @ 20 checks/request | 20,000 checks → 10,000 billable = **$10** | 100,000 → **$90** | 600,000 → **$590** |
| **Fastly, but only confirming ~8 survivors/request** | 8,000 → free | 40,000 → **$30** | 240,000 → **$230** |
| **WhoisJSON Pro** ($10, 30k req, 40 rpm) | **$10** | **$30** (Ultra) | **$50** (Scale) — but 100 rpm caps concurrency |
| **rdapapi.io Starter** ($9, 30k, 30 rpm) | **$9** — but 30 rpm = one user per minute, and it inherits the `.io`/`.co`/`.me` gaps | — | — |
| **WhoAPI Freelancers** ($23, 40k) | **$23** | **$49** | **$99** |
| **IP2WHOIS Starter** | $49 for 5,000 checks = $0.0098 each — **10× Fastly**. Never |

**Cheapest real-time path: $0/mo** (RDAP + a free registrar API). Fastly is the "I don't want to think about it" option and stays under $50/mo up to ~2,500 user requests/mo at full 20-candidate confirmation, or ~7,000/mo if you only confirm survivors.

---

## 5. Accuracy math

Ground truth for the denominators: **401.6M** total registrations (Verisign DNIB Q2 2026), `.com` **166.6M**, `.net` **12.5M**, ccTLDs **148.6M**.

### 5.1 The delegation gap, measured properly

The widely repeated "25–47% of registrations are missing from zone files" figure comes from ntldstats and is wrong. Computed from ICANN's own April 2026 `Totals` rows against dns.coffee's 2026-08-06 zone counts:

| TLD | Registered (ICANN Apr 2026) | In zone (Aug 2026) | Gap = false-"available" floor |
|---|---|---|---|
| `.com` | 168,322,419 | 165,151,436 | **1.9%** |
| `.shop` | 4,426,301 | 4,357,466 | **1.6%** |
| `.net` | 12,688,805 | 12,332,134 | **2.8%** |
| `.org` | 12,449,632 | 12,049,613 | **3.2%** |
| `.info` | 5,574,394 | 5,248,653 | **5.8%** |
| `.top` | 6,992,174 | 6,270,647 | **10.3%** |
| `.online` | 3,875,629 | 3,453,792 | **10.9%** |
| `.store` | 2,340,420 | 2,071,702 | **11.5%** |
| `.site` | 2,093,221 | 1,816,804 | **13.2%** |
| `.xyz` | 8,679,016 | 8,951,321 | **−3.1%** (zone larger than the registry count — 4-month offset artifact) |

Cross-checks from registries that publish the *full* register: `.sk` has **2,510 of 485,434** rows with an empty nameserver field = **0.517%**; Verisign's own counter gives `.com` **2,607,057 / 167,756,404 = 1.554%** and `.net` **1.812%**.

**⚠️ These gaps are not uniformly distributed.** They concentrate in (a) names registered in the last hours with no NS yet, (b) premium/held names parked without nameservers, (c) names in `redemptionPeriod`/`pendingDelete` — 30 + 5 days out of the zone but **not purchasable**. All three overlap heavily with short brandable strings, so your *effective* rate on real LLM candidates exceeds the headline percentage.

### 5.2 Per-approach error rates

| Approach | False-"available" (user clicks affiliate link, can't buy) | False-"taken" (good name silently dropped) | Dominant cause |
|---|---|---|---|
| **Current: snapshot only, gTLD zone data, 15/27 TLDs covered** | **~1.9–13.2% on covered gTLDs, 100% on the 12 uncovered ccTLDs.** If ~40% of generated candidates land on `.io/.co/.ai/.me/.de/…`, blended ≈ **40% + (0.6 × ~4%) ≈ 42%** | Near 0 if the snapshot is fresh; rises with cadence — AFNIC monthly means up to **7 weeks** of deleted names still marked taken | Missing TLDs ≫ delegation gap ≫ 24 h lag |
| **Snapshot only, vendor list claiming ccTLD coverage** | ccTLD rows are crawl-derived. Illustrative: a vendor advertised 789K `.dk` against a real registry base of ~1.4M = **44% under-report**. Blended ≈ **15–20%** (unverified) | Same as above | Crawl-derived ccTLD data is systematically incomplete |
| **DNS NXDOMAIN probe** | **0/13 = 0% on `.com`; 9/66 = 13.6% on `.xyz`** (independently replicated 2026-08-06). Every false positive inspected was a mid-2025 registration with a mid-2026 expiry — i.e. redemption-window, not delegation | **100% on wildcard TLDs** — `.ws` returns 64.70.19.203 and `.ph` returns 45.79.222.138 for *any* label. Neither is in your picker, but a wildcard TLD would silently mark every candidate taken | Expiry/redemption lag; TLD wildcards |
| **Registry RDAP** | Only names that 404 while being unregisterable: ICANN Spec 5 reserved (all 2-char labels, country/territory names, IGO/INGO), Identity Digital **DPML** trademark blocks across ~265 TLDs, registry-reserved and premium strings. **Unquantified; low single digits for brandable strings** (unverified) | **≈0** | Reserved/blocked names are invisible to every negative-signal method |
| **RDAP where a TLD is absent from the bootstrap** | **100% if you fail open.** `.co` and `.me` return 404 from every candidate endpoint tested — indistinguishable from "available" | 0 | **You must fail closed: absent TLD ⇒ `unknown`, never `available`** |
| **Registrar API (Namecheap/name.com/Spaceship/Fastly)** | **≈0**, and these are the only sources that also return `IsPremiumName` / `premium` / `dpml` / `priced`, so you can avoid sending a user to a $5,000/yr checkout labelled "available" | TLD the registrar doesn't sell must render as `unknown`, not `taken` (Cloudflare's `registrable:false` means "we don't sell it", a real trap) | Coverage mismatch, not data error |
| **Snapshot pre-filter + RDAP confirm on survivors** ← recommended | **≈0–1% on 23 of 27 TLDs**; residual is reserved/DPML/premium only. `.co`/`.me`/`.eu`/`.jp` handled by registrar API or `unknown` | **≈0**; the snapshot's false-takens are erased because you only ever *confirm* the "available" side | Reserved/premium names — fixable by upgrading the confirm layer to Fastly |
| **Bloom filter pre-filter (460 MB @ 0.1%)** | **0 by construction** — a Bloom false positive says "registered" | **0.1%** — you silently drop ~1 good name per 1,000 | Error direction is the *right* one for this product |

### 5.3 Snapshot lag arithmetic

domains-monitor reports **336,802 new / 261,252 removed per day**; DNIB shows **+9.1M net per quarter** (~100k/day net). Against a 401.6M universe, 24 h of lag adds only **~0.084%** baseline false-available. That's negligible — **but it is entirely concentrated in newly-registered short brandable names**, which is precisely your candidate distribution. Do not reason about lag with the global average.

---

## 6. Integration sketches

Current code: one `SELECT domain FROM domains WHERE domain = ANY($1)` per request, boolean result, fail-open on DB error (`available: true` for everything — **this fails in the expensive direction and should be inverted regardless of which sketch you pick**).

### Sketch A — "Fix the snapshot in place" (minimal diff)

```
CZDS API (or vendor ZIP) ──nightly cron on the PG VM──►
  gunzip → awk NS-owner names → sort -u → COPY into domains_new (UNLOGGED)
  → CREATE INDEX USING hash → ALTER TABLE RENAME swap → DROP old
```

- **Where it runs:** the existing Postgres VM. No app change except adding a `tld_coverage` table so uncovered TLDs return a third state instead of `true`.
- **Storage:** 250M rows ⇒ heap **11.6 GB** + hash index **6.4 GB** = **18.0 GB** (btree would be 8.8 GB / 20.4 GB total). Rebuild needs double the disk transiently ⇒ **budget 45 GB**. Your README provisions 40 GB — **too small**. Restricting to your 15 offered gTLDs cuts it to ~212M rows / ~15 GB, but `.com` alone is 165M so the saving is modest.
- **Ingest cost:** `.com` alone is ~3.5 GB gzipped / ~14 GB raw (unverified, extrapolated from a 2018 measurement of 2.91 GB @ 133M names). Download + parse + dedupe + load + index is **hours** on 2 vCPU/2 GB.
- **Refresh:** daily. CZDS caps you at one download per zone per 24 h.
- **Latency:** 20-candidate `= ANY()` measured at **5.8 ms / 17 page reads** with a hash index (9.8 ms / 52 reads with btree). Cold reads on a network volume are the real variable.
- **Hosting delta:** DigitalOcean 4 GiB/2 vCPU/80 GB = **$24/mo** (up from $6). Managed PG equivalents: DO 2 GiB **$30.45**, Supabase Pro + Large compute **~$126**, Neon Launch **~$84**.
- **Tradeoff:** cheapest per-request cost (zero network calls), but you keep a **~42% blended false-available rate** because 12 of 27 TLDs have no data. **Not sufficient on its own.**

### Sketch B — "Snapshot as pre-filter + RDAP confirm" ← recommended

```
Phase 1 (5.8 ms):  one ANY() query kills the 60–80% obviously-registered
Phase 2 (parallel, 250 ms deadline):
   for each survivor → RDAP GET {bootstrapMap[tld]}/domain/{name}
   200 → taken · 404 → available · timeout/absent-TLD → unknown (no affiliate link)
Boot/daily: fetch data.iana.org/rdap/dns.json (71 KB, 1,200 TLDs), cache in-process,
            merge hardcoded overrides for .io / .de / .us
```

- **Where it runs:** Phase 1 in Postgres (unchanged), Phase 2 in the Next.js route handler with an HTTP keep-alive agent **per registry host** and a per-registry concurrency cap of 2.
- **Storage:** same as A — **or drop Postgres entirely** and hold a **460 MB Bloom filter** (250M @ 0.1% FP, 10 hashes) resident in the Node process. Sub-microsecond, no I/O, and its errors point the safe way. A SQLite `WITHOUT ROWID` file is the middle option: **23.6 bytes/row ⇒ ~5.9 GB** for 250M, 0.18 ms warm for 20 lookups, atomic-rename swaps.
- **Refresh:** daily snapshot; bootstrap file daily; RDAP is live.
- **Latency budget — the hard part.** Measured cold single-query RDAP: `.com` **0.13 s**, `.xyz` 0.22 s, `.dev` 0.23 s, `.top` 0.71 s, `.org` 0.76 s, `.online` 0.78 s, `.io` **0.80 s**, `.shop` **1.16 s**. Fully parallel, p95 is bounded by the slowest registry in the batch. **Enforce a 250 ms deadline and render anything that misses it as `unknown` / "verifying…"**, resolved by a follow-up request.
- **`.co` / `.me`:** no working RDAP. Either route them to Spaceship (20/batch, free) or name.com (50/batch, free), or drop them from the picker.
- **Cost:** **$0** beyond the snapshot. Reduces RDAP traffic ~80–90% versus a naive per-candidate design, which is what keeps you inside registry goodwill.
- **Tradeoff:** two failure domains instead of one, and you must add a third UI state. In exchange, false-available drops from ~42% to ~0–1%.

### Sketch C — "No snapshot, hosted API"

```
checkAvailability() → batch the candidates by TLD →
   name.com  POST /core/v1/domains:checkAvailability  (50 domains/call, 20 req/s)
   Spaceship POST /v1/domains/available               (20 domains/call, 30 req/30 s)
   Fastly    GET  /status?domain=…                    (1 domain/request) for anything else
```

- **Where it runs:** entirely in the Next.js route. **Delete the `domains` table, the VM, and the whole ingest pipeline.**
- **Storage:** 0. Add a small Redis or in-Postgres result cache with a short TTL to absorb repeat lookups of popular names (Spaceship enforces 5 requests per *domain* per 300 s).
- **Cost:** **$0/mo** on name.com + Spaceship free tiers; **$0 → $20/mo** if you add Fastly for premium/reserved detection at ~30k checks.
- **Latency:** one batched call covers all 20–30 candidates ⇒ a single round trip, typically better p95 than fanning out RDAP. name.com's 50-per-call / 20 req/s is the best throughput of any free API here.
- **Tradeoff:** a hard third-party dependency in the request path, with no SLA and no contractual right to power a public checker (neither name.com nor Spaceship publishes terms addressing it). TLDs the registrar doesn't sell must render `unknown`. But it removes ~18 GB of storage, a nightly cron, per-TLD CZDS approvals, and the entire staleness problem.

**Recommendation:** ship **C** first (a day's work, $0, and it immediately fixes the ccTLD hole), then add **B**'s snapshot back as a latency/cost optimisation if traffic justifies it. The snapshot is a caching layer, not a source of truth — treating it as the latter is the root cause of the current accuracy problem.

---

## 7. Open questions — decide or verify before building

**Product / UX**
1. **Will you accept a third state?** `DomainResult.available` is a boolean. Every correct architecture needs `available | taken | unknown`. Without it there is no honest way to render `.co`, `.me`, an RDAP timeout, or an uncovered TLD.
2. **Invert the fail-open default.** `checkAvailability` currently reports *everything available* on a DB error. That sends users to a GoDaddy checkout for domains that are taken. It should fail to `unknown`.
3. **`.web` is in `SPECIALTY_TLDS`** — verify it is actually a delegated TLD against `data.iana.org/TLD/tlds-alpha-by-domain.txt` (version 2026080600, 1,438 TLDs). It has been contested for years; if it isn't delegated, every `.web` suggestion is unbuyable. **(unverified)**
4. **Drop `.co` / `.me` / `.eu` / `.jp` from the picker, or pay for them?** `.co` and `.me` have no working RDAP (verified); `.eu` and `.jp` are **(unverified)**. These four are the only TLDs in your set with no free path.

**Data / licensing**
5. **Where did the current `domains` table come from, and under what licence?** Nothing in the repo records it. If it's a stale HuggingFace/domains-project dump, it is ~2022 vintage and every domain registered since reads as available.
6. **Will CZDS approve your stated purpose?** §1.1(1) prohibits supporting "any marketing activities, regardless of the medium used" and §1.3 prohibits using the Data "for any marketing purposes whatsoever". A plain reading targets unsolicited outreach, not affiliate links on the surrounding product — but this is the single legal question that decides whether the free path exists. Write a specific purpose statement naming dodomains.dev; vague "research" justifications get rejected.
7. **Read Nominet's zone-file T&C in a browser** (`nominet.uk/uk-registry/uk-policy/zone-files-terms-and-conditions/` — 403s to fetchers). `.uk` is now free *and* ships a **full registration list** with no delegation gap, which would make it the single best ccTLD source you can get — if the licence permits.
8. **Confirm Fastly's price.** `fastly.com/pricing` publishes 10,000 free/mo then $0.001 Status-Precise; `docs.fastly.com` still says billing details are unpublished. Verify which governs before modelling cost.
9. **Confirm TLD-List is still $9/mo.** The live pricing page Cloudflare-403s all automated access; the $0/$9/$99/$199 tiers and the "No Restrictive Licensing — use and republish however you want" grant come from a **2026-03-26 Wayback snapshot (unverified-current)**.

**Infrastructure**
10. **Does your host allow outbound TCP/53?** Required for any AXFR path (`.se`, `.nu`, `.ee`). Blocked by default in many environments.
11. **Do you have a static egress IP?** Namecheap's API mandates IPv4-only IP whitelisting — unusable from serverless without proxying through the VM.
12. **Disk.** README-postgres provisions 40 GB; a 250M-row gTLD snapshot needs ~18 GB steady-state and ~45 GB during an index rebuild. Decide now whether to resize ($6 → $24/mo on DigitalOcean) or switch to a SQLite file (~5.9 GB) or a Bloom filter (460 MB).

**Money**
13. **Ask your GoDaddy CJ contact whether the affiliate relationship unlocks Domains API access.** The API requires 50+ domains or ≥$20/mo spend — but you are sending them referral traffic, which is a reasonable lever. GoDaddy's Discount Domain Club "Domain Pro" tier grants 100,000 calls/month.
14. **Namecheap's $50 gate is a refundable account balance, not a fee** — if you're willing to park $50, you get 8,000 checks/day, premium flags, premium prices and the ICANN fee, from the registrar you already earn 20% from.