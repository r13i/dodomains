# Domain Availability Architecture: Benchmark Decision Report

**Date:** 2026-08-07 · **Source:** 6 independent replication runs (each re-measured the prior run's headline with its own harness) · **Environment for all latency numbers:** residential US egress, macOS, Node v24.14.0 / curl 8.7.1. Production targets Node 22.

**TLD denominator, stated once:** `src/app/page.tsx:34-46` contains 32 entries across four arrays; `ai`, `io`, `co`, `app` appear twice, so the app offers **28 unique TLDs**, not 27. With `.web` dropped per the maintainer's decision, **27 remain** — that is the scorecard denominator in §3.

---

## 1. Verdict

The numbers support **architecture C, hardened** — RDAP over a warm keep-alive pool with per-TLD deadlines and an explicit `unknown` state — as the thing to ship, **plus a name.com key created in parallel**, because a registrar key is the only measured-capable source of the premium flag you asked for and the only way to ever validate architecture A, which today has **zero** measured authenticated latency numbers from any of the six runs. The deciding number: a warm-pool, unbounded-concurrency, **fresh-name** fan-out over 22–24 candidates measures **1150 ms (run 1) and 1207 ms (run 6)** wall clock, of which **~1160 ms is one registry** — `rdap.gmoregistry.net` (.shop) burning pure server time on a cache miss (5 samples, 1129–1199 ms; DNS 3 ms, TLS 27 ms, so pooling cannot touch it) — and removing `.shop` drops the identical parallel pass to **~365 ms**. So RDAP is not slow; two registries are, rate limiting rather than latency is the binding constraint, and A-only cannot be recommended on evidence that does not exist.

---

## 2. Measured results table

Every row is flagged **MEASURED** (someone ran it), **DOCUMENTED** (read off a live vendor spec, never executed), or **MODELLED** (arithmetic on measured inputs). Where two runs disagree, both are shown with their sample sizes.

### Latency — RDAP

| # | Subject | Metric | Value | n | Flag |
|---|---|---|---|---|---|
| 1 | Warm pool, fresh names, full mix **incl. .shop** | wall clock | **1207 ms** (run 6, 22 URLs) / **1150 ms** (run 1, 24 URLs) | 2 independent passes | MEASURED |
| 2 | Same pass, **.shop excluded** | wall clock (= slowest survivor, `rdap.ca.fury.ca` 361 ms) | **~365 ms** | 21 of 22 requests in one pass | MEASURED (wall derived from measured concurrent per-request times) |
| 3 | Warm pool, fresh names, **fast-host subset** (no shop/au/blog/fury) | wall clock | **211 / 214 / 224 ms** | 3 rounds × 24 req (run 2) | MEASURED — subset, not full coverage |
| 4 | Warm pool, **.shop and .au returning instant 429s** | wall clock | 214 ms (run 3), 242 ms (run 1 round 3) | 3 + 1 rounds | MEASURED but **ARTIFACT** — the gating host was rejected, not served |
| 5 | Warm pool, **same names repeated** | wall clock | 222 / 303 / 311 ms | 3 rounds (run 6) | MEASURED but **CONTAMINATED** — measures the registry's cache |
| 6 | Cold process, fresh sockets + fresh names | wall clock | **608 / 670 / 1159 / 1528 ms** across four runs (host-mix dependent) | 1–2 passes each | MEASURED |
| 7 | Per-request, warm pool | p50 / p95 / max | 136–161 / 206–361 / 1199 ms | 22–72 req | MEASURED |
| 8 | Per-request, cold | p50 / p95 / max | 419–535 / 592–651 / 1138 ms | 22–48 req | MEASURED |
| 9 | `rdap.gmoregistry.net` (.shop) fresh names | TTFB | **1129, 1138, 1165, 1197, 1199 ms** (DNS 3 ms, TLS 27 ms) | 5 | MEASURED |
| 10 | `.shop` **repeated** name / **registered** name | TTFB | 12–58 ms / 82 ms | 3 / 1 | MEASURED — why registered-name-only benchmarks score .shop as fast |
| 11 | `rdap.verisign.com` connection reuse | new sockets per warm round | 4 of 4, every round (16 total) | 4 rounds, undici `diagnostics_channel` | MEASURED — server behaviour, not a curl artifact |
| 12 | Every other host | sockets opened after round 0 | 0 | 4 rounds | MEASURED |

### Latency — DNS pre-filter (architecture C′)

| # | Subject | Metric | Value | n | Flag |
|---|---|---|---|---|---|
| 13 | 25-domain parallel NS lookup @1.1.1.1, Node resolver | wall clock | **1091 / 1655 / 1697 ms** | 3 passes | MEASURED |
| 14 | Same, curl/xargs harness | wall clock | 451 / 1321 / 2571 / 3105 ms | 4 passes | MEASURED |
| 15 | Per-query | p50 / p95 / max | 25–30 / 892–1637 / 1693 ms | 41–75 | MEASURED (prior 82 ms p50 was 2 perl spawns per query) |
| 16 | DNS-first **false-taken** (NOERROR but RDAP 404), .web excluded | rate | 0 % (0/30) — 95 % upper bound ~11.6 % | 30 | MEASURED |
| 17 | DNS-first **false-available** (NXDOMAIN but RDAP 200) | rate | 4.8 % (1/21) — `logo.design`, status `inactive` | 21 | MEASURED |

### Latency — registrar APIs (architecture A)

| # | Subject | Metric | Value | n | Flag |
|---|---|---|---|---|---|
| 18 | **Authenticated 27-domain availability call, any registrar** | latency | **NO MEASUREMENT EXISTS** | 0 | — |
| 19 | name.com unauthenticated rejection TTFB | ms | 239, 748, 808, 842, 920 | 5 across 2 runs | MEASURED — auth rejection, **not** an availability latency |
| 20 | Spaceship / GoDaddy v3 / GoDaddy v1 / Domainr rejection | ms | 236 / 81 / 77 / 85 (TLS+TCP only ~28 ms of that) | 1 each | MEASURED — auth rejection only |
| 21 | Porkbun `pricing/get` (only keyless pricing source) | total | 12.31–21.41 s, 82,216 B | 6 across 2 runs | MEASURED — cron-only, never inline |
| 22 | RDAP `.com` single lookup (floor reference) | total incl. TLS | 89–121 ms | 6 | MEASURED |
| 23 | name.com batch cap / rate limit | — | 50 domains/req; 20 req/s **and 3,000 req/hr** account-wide | — | DOCUMENTED (live OpenAPI + docs.name.com/api/v1/overview.md) |
| 24 | GoDaddy v1 batch cap | — | 500 — declared with JSON-Schema `maximum`, a **no-op on arrays**; unenforceable as written | — | DOCUMENTED |
| 25 | Spaceship batch cap / limits | — | **20 domains/req**; availability 30 req/user/30 s; single-domain 5 req/domain/300 s | — | DOCUMENTED (docs.spaceship.dev, re-fetched today) |

### Coverage and correctness

| # | Subject | Value | n | Flag |
|---|---|---|---|---|
| 26 | IANA RDAP bootstrap coverage of the 28 offered TLDs | **21 of 28**; missing `co de eu io jp me us` | live fetch, publication 2026-07-23T02:00:03Z, 4 independent re-fetches agree | MEASURED |
| 27 | TLDs answerable by RDAP **or** port-43 whois | **27 of 28** — only `.web` is dark | — | MEASURED |
| 28 | `.co` over RDAP | 404 for the registered `google.co` on **5 path variants across 2 hosts**; invented `.co` labels also 404 → indistinguishable | 5+ | MEASURED |
| 29 | `.co` over port-43 `whois.registry.co` | discriminates **both directions** (full record vs `DOMAIN NOT FOUND`); 272–324 ms | 2 runs, 4 queries | MEASURED |
| 30 | `.eu` over port-43 `whois.eu` | discriminates; emits literal `Status: AVAILABLE`; 103–105 ms | 2 | MEASURED |
| 31 | `.jp` over port-43 `whois.jprs.jp` **with the `/e` suffix** | discriminates (`Domain Information:` vs `No match!!`); 607–619 ms | 2 | MEASURED |
| 32 | `.me` over `rdap.identitydigital.services` | **works** — `google.me` → 200 with `ldhName`, 4 invented labels → 404 | 2 independent sessions | MEASURED |
| 33 | `.web` | `nic.web` → 200, `google.web` and invented labels → 404, **and** DNS wildcards every label to `A 127.0.53.53` | 3 runs | MEASURED — correctly dropped |
| 34 | RDAP backends exposing any premium/price field | **0 of 10** | 10 backends, ~60 requests | MEASURED |
| 35 | Backends where a permanently-reserved name's 404 is byte-identical to an available name's | **4 of 8 testable** (Google .app/.dev, CentralNic .xyz, Identity Digital .io/.ai/.me/.digital, nic.design) | 26 requests | MEASURED |
| 36 | ICANN `ReservedNames.xml` | 615,766 B, 4,008 records, 7,704 labels; contains **none of** `example`, `www`, `nic`, `germany` — IGO/INGO only | full file, 2 runs, byte-identical | MEASURED |
| 37 | Static-list yield on real brandable labels | **0 of 18** unique second-level labels | 18 | MEASURED (n small) |
| 38 | name.com quickstart TLD CSV vs the 27 | **18 of 27** present; absent: `ai us uk ca eu de fr jp au` | 472-entry CSV, live | DOCUMENTED — docs say the list is "not exhaustive", so this is an **open question**, not a proven gap |
| 39 | `rdap.co` | returns **HTTP 200 for every path**, `Content-Type: text/html`, 114-byte parking redirect | several | MEASURED — status-code-only clients would mark all `.co` taken |

### Rate limiting

| # | Host | Trigger observed | n | Flag |
|---|---|---|---|---|
| 40 | `rdap.gmoregistry.net` (.shop) | 429 at request **#5** (run A), **#8** at 0.6 s spacing (run B), **0 in 10** requests (run C) | 3 sessions | MEASURED — threshold is a rolling/shared window, report as a **range of 5–10** |
| 41 | `rdap.cctld.au` (.au) | 429 in **35 ms on the very first request** from one egress (run 2); 429 at request #4 within ~10 s (run 6); 429 at ~7 requests (run 3) | 3 sessions | MEASURED — instant response implies IP/policy, not volume |
| 42 | `pubapi.registry.google` (.app/.dev) | 429 after **~12 requests in ~5 s** | 1 | MEASURED |
| 43 | `rdap.identitydigital.services` | **0 429s** in 12, 26, 28, 29, 31 requests across four sessions | 4 | MEASURED |
| 44 | `api.name.com` **unauthenticated** | 429 on request **#1** (one run) and **#2** (another); 3 of 4 requests 429 | 2 sessions | MEASURED — does not contradict the documented per-account 20 req/s |

---

## 3. Per-TLD RDAP scorecard (27 TLDs, `.web` dropped)

`p50` = warm-connection server time on a **free/invented** name (the availability path), primarily from run 3's 16-host cold-vs-warm sweep (n=2 warm per host); cross-checked against runs 1, 2 and 6 where available. **Failures in bold.**

| TLD | Endpoint | In IANA bootstrap | Works? | Warm p50 (ms) | Reserved flag in 404 body | Notes |
|---|---|---|---|---|---|---|
| de | `rdap.denic.de` | no — hardcode | yes | **35** | untested | best pooling gain measured, 16× |
| uk | Nominet (bootstrap) | yes | yes | 47 | untested | |
| xyz | `rdap.centralnic.com/xyz/` | yes | yes | 58 | no | `abc.xyz` → 200 control passes |
| fr | `rdap.nic.fr` | yes | yes | **58** (run 3, n=2) vs **140–149** (run 1, n=2×3) | untested | runs disagree — treat as 58–150 |
| com | `rdap.verisign.com/com/v1/` | yes | yes | 110 (98–121) | **structurally impossible** — 404 body is 0 bytes | opens a new TCP+TLS on every request; pooling buys nothing, but it is already ~90–120 ms |
| net | `rdap.verisign.com/net/v1/` | yes | **INFERRED** — never control-tested with a registered name | ~110 assumed | impossible (same 0-byte body) | the one endpoint in the working set with no positive control |
| ca | `rdap.ca.fury.ca` | yes | yes | 122–124 (361 ms observed as one fan-out's slowest survivor) | untested | |
| cloud | `rdap.registry.cloud` | yes | yes | 130 | **YES** — "Reserved for CLOUD Registry" | only backend that flagged a 2-char label (`vc.cloud`) |
| tech | `rdap.radix.host/rdap/` | yes | yes | 135 | **YES** — "This name is not available for registration: Registry Reserved" | |
| store | `rdap.radix.host/rdap/` | yes | yes | 135 | **YES** | |
| site | `rdap.radix.host/rdap/` | yes | yes | 135 | **YES** | |
| online | `rdap.radix.host/rdap/` | yes | **INFERRED** from same-host tech/store/site | 135 | **YES** (inferred) | |
| app | `pubapi.registry.google/rdap/` | yes | yes | 163 | no — reserved and available 404 bodies are byte-identical | **429 after ~12 req in 5 s** |
| dev | `pubapi.registry.google/rdap/` | yes | **INFERRED** from same-host app | 163 | no | same 429 exposure |
| us | `rdap.nic.us` | no — hardcode | yes | 169 | untested | |
| org | `rdap.publicinterestregistry.org/rdap/` | yes | yes | 180–199 | untestable (`example.org` is registered) | |
| design | `rdap.nic.design` | yes | yes | 185 | no — "No data found" | catches `logo.design`, the one DNS false-available |
| io | `rdap.identitydigital.services/rdap/` | no — hardcode | yes | 208 | no — "Object not found" | |
| ai | `rdap.identitydigital.services/rdap/` | yes | yes | 208 | no | most expensive TLD in the set ($82.70 base) |
| digital | `rdap.identitydigital.services/rdap/` | yes | yes | 208 | no | |
| me | `rdap.identitydigital.services/rdap/` | **no — hardcode** | **yes** | 208 | no | **premise correction: `.me` needs no registrar account.** Verified both directions in 2 sessions. Absent from bootstrap → will break silently if Identity Digital moves it |
| blog | `rdap.blog.fury.ca` | yes | yes | 212 | **YES** — title `01044`, "usage restrictions applied" | |
| **au** | `rdap.cctld.au` | yes | **reachable but rate-limited on contact** | 296 | untested | **429 in 9–35 ms on the first or ~4th request in 3 of 3 sessions.** Effectively unusable from a single egress IP |
| **shop** | `rdap.gmoregistry.net` | yes | **yes, but 1.13–1.20 s warm on fresh names** | **1120–1197** | **YES** — "is a reserved name" | **the gating host.** Pooling is powerless (DNS 3 ms, TLS 27 ms). 429s at 5–10 requests in 2 of 3 sessions. Alone doubles the fan-out wall clock |
| **co** | `rdap.registry.co` | no | **NO — silently wrong** | n/a | n/a | Live, RDAP-conformant, **404s everything** including `google.co` (5 variants, 2 hosts). 404-as-available marks 100 % of `.co` free. Also `rdap.co` is a **parking page returning 200 for every path** (`text/html`). **Working path: port-43 `whois.registry.co`, 272–324 ms, discriminates both directions** |
| **eu** | none | no | **NO** | n/a | n/a | `rdap.eurid.eu` no A record; `rdap.eu` → ECONNREFUSED in 30–37 ms; `rdap.org` redirector 404; IANA root-db lists whois only. **Working path: port-43 `whois.eu`, 103–105 ms, emits `Status: AVAILABLE`** |
| **jp** | none | no | **NO** | n/a | n/a | `rdap.jprs.jp`, `rdap.nic.jp`, `rdap.jp`, `rdap.dns.jp`, `rdap.jprs.co.jp` all NXDOMAIN. **Working path: port-43 `whois.jprs.jp` with the required `/e` suffix, 607–619 ms.** JPRS banner restricts use to "network administration purposes" — ToS risk, unmeasured |

**Summary:** 23 of 27 answer correctly over RDAP today. `.au` is reachable but 429s on contact. `.co`/`.eu`/`.jp` have no RDAP but **all three discriminate cleanly over port-43 whois**. `.shop` answers correctly but 4× over budget. Two endpoints (`net`, `online`, and `dev` by extension) are inferred from a same-host sibling and have never been control-tested — cheap to close.

---

## 4. Latency reality — one 25-candidate user search

All figures MEASURED unless marked. "Warm" means a long-lived Node process with a keep-alive agent and live sockets; "fresh names" means labels never previously queried, because repeating a name measures the registry's cache and inflates results by ~4× (222–311 ms contaminated vs 1207 ms honest, same harness, run 6).

| Architecture | Wall-clock p50 | Wall-clock p95 / worst | Per-request >250 ms | Per-request >500 ms | <300 ms achievable? |
|---|---|---|---|---|---|
| **C — RDAP, cold process** | 608–1159 ms (mix-dependent; p50 670 ms over 2 runs on a 24-URL mix) | 707–1528 ms | **67 %** (32/48) | **48 %** (23/48) | **No.** Never. |
| **C — RDAP warm, full 27-TLD mix incl. .shop** | **~1207 ms** (n=2 passes: 1150, 1207) | max = .shop, 1199 ms | ~2/22 | ~1/22 | **No.** |
| **C — RDAP warm, `.shop` deadlined out** | **~365 ms** (slowest survivor `ca` 361 ms) | 361 ms | ~1/21 | 0/21 | **Marginal.** Only with a deadline. |
| **C — RDAP warm, fast-host subset** (no shop/au/blog/fury) | **214 ms** (211/214/224, n=3) | 224 ms | **0 of 72** | **0 of 72** | Yes — but this is **not full coverage** |
| **C′ — DNS pre-filter, then RDAP** | DNS stage alone **1091–3105 ms** (7 passes), then the RDAP stage on top | 3105 ms | — | — | **No.** Strictly worse. |
| **A — registrar batch** | **UNMEASURED** | UNMEASURED | UNMEASURED | UNMEASURED | **Unknown.** 1 round trip vs 25, so plausible — but nobody has run it. |

**Plain answer: yes, <300 ms is achievable, but only under four simultaneous conditions**, and it is not achievable for all 27 TLDs at once:

1. **A persistent process with a warm keep-alive pool.** Cold is 608–1528 ms; the first request in a fresh process costs ~600 ms. The deployment target is **unresolved**: `src/app/api/generate/route.ts:11` sets `export const maxDuration = 60` (a serverless marker) while the repo also carries `docker-compose.yaml` and a plain `next start`. If it is serverless with frequent cold starts, most searches pay 670–1159 ms and the answer flips to **no**.
2. **A per-TLD deadline of ~250–350 ms, rendering `unknown` (never `available`) on timeout.** `.shop` misses it **100 % of the time even warm**. `.au`, `.ca`, `.blog` and the Identity Digital four (`io`/`ai`/`me`/`digital`, 208 ms) miss it intermittently.
3. **Fresh-name honesty.** Do not design against the 214–311 ms numbers; those are either fast-host subsets, 429-artifact rounds, or registry-cache hits.
4. **An app-side result cache.** This is the one measured way to get the whole 27 under 300 ms: the contaminated runs (222–311 ms with `.shop` at 12–58 ms) are a direct measurement of what caching buys. You are simply moving the registry's cache into your tier.

**C′ (DNS pre-filter) is dead.** Its correctness is fine (0/30 unrecoverable false-taken with `.web` gone; 1/21 recoverable false-available, caught by the RDAP confirm) but it prepends **1.1–3.1 s** to a stage that costs 0.36–1.2 s. You cannot buy rate-limit headroom at 3× the latency of the thing you are protecting.

---

## 5. Rate limits and terms risk

### What actually happened (all MEASURED)

| Host | Observed | Sessions |
|---|---|---|
| `rdap.cctld.au` (.au) | **429 in 9–35 ms on the first or ~4th request** from this egress, three sessions out of three | 3 |
| `rdap.gmoregistry.net` (.shop) | 429 at request **#5**, **#8**, and **0 in 10** — a rolling or shared window, not a fixed counter | 3 |
| `pubapi.registry.google` (.app/.dev) | 429 after **~12 requests in ~5 s** | 1 |
| `api.name.com` unauthenticated | 429 on request **#1** and **#2**; 3 of 4 requests | 2 |
| `rdap.identitydigital.services` | **zero** 429s at 12, 26, 28, 29 and 31 requests | 4 |
| Everything else | zero 429s, zero 503s, zero TLS failures across ~700 requests total | 6 |

**Four distinct backends have now throttled at trivial volume.** A confound worth stating: several runs shared one egress IP and at times ran concurrently, so per-client thresholds may be higher than the raw counts. It does not change the direction.

### Projection (MODELLED — arithmetic on 25 requests/search, `.com` at 3–4 of 25, `.shop` at ~1 of 25)

| Searches/day | Total RDAP req/day | To Verisign (.com/.net) | To `rdap.gmoregistry.net` (.shop) | Verdict |
|---|---|---|---|---|
| 100 | ~2,500 | ~350–400 | ~100 | Survivable *if* traffic is smooth. A burst of 6+ concurrent searches puts 6 simultaneous requests on `.shop` — inside the observed 5–10 429 window. |
| 1,000 | ~25,000 | ~3,500–4,000 | ~1,000 | `.shop` and `.au` will 429 routinely. Google Registry (~2,000/day at 12-per-5s tolerance) is at risk under any burstiness. |
| 10,000 | ~250,000 | ~30,000–40,000 | ~10,000 | **Not viable unmitigated.** No registry publishes an RDAP quota this large; several document blacklisting for bulk access. |

**Terms risk, stated honestly:** PIR, Identity Digital and CentralNic all publish per-IP throttling/blacklisting policy for bulk access. Google's `.app`/`.dev` endpoint is a self-described pilot they may discontinue. **JPRS's whois banner restricts use to "network administration purposes"** — using it to power a commercial affiliate search is a live ToS question, and nobody measured whois rate limits at all. **Nothing in these six runs tested sustained production-rate traffic against any host**; doing so would have breached volume discipline. It remains the single largest untested risk.

**Implication for the architecture choice:** a warm pool makes you *faster*, not politer — it concentrates traffic on a few sockets from one egress IP. The mitigations that actually work are (a) an app-side result cache with a long TTL, (b) per-registry deadlines and circuit breakers, (c) moving the highest-volume TLDs onto one authenticated registrar batch call. **(c) is the strongest reason to create a registrar key**, independent of latency.

---

## 6. The premium / reserved gap

**Share of "available" answers that are not buyable at base price: UNMEASURED.** No run measured a premium rate over real LLM-generated candidates. The only related datum is 0 hits out of 18 unique brandable labels against the static ICANN list (n=18, useless as a rate estimate). Do not let any number stand in for this — it is the exact gap the registrar key would close.

**What is measured:**

- **0 of 10 RDAP backends expose any premium flag, price field, or price hint.** RDAP has no price field in the protocol. This is structural, not a gap in the sample.
- **4 of 8 testable backends return a 404 for a permanently-unregisterable name that is byte-identical to a genuinely available name** — Google (.app/.dev), CentralNic (.xyz), Identity Digital (.io/.ai/.me/.digital), nic.design. Verified with `example.<tld>` (ICANN Spec 5 §3, unregisterable in every gTLD) and `germany.<tld>` (§4) against a coined control. Verisign (.com/.net) is worse than indistinguishable: its 404 body is **0 bytes** and can never carry any signal.
- **12 of the 27 TLDs are ccTLDs** (`io co ai me us uk ca eu de fr jp au`) and are not bound by ICANN Spec 5 at all.

**Does a free static reserved-name list get most of the way? No — it gets nowhere.** ICANN `ReservedNames.xml` replicated to the byte across two runs (615,766 B XML, 4,008 records, 7,704 unique labels, 224,258 B as a flat file, O(1) lookup, genuinely free and tiny). But it is the **IGO/INGO list only**: it contains `olympic`, `unesco`, `redcross`, `who`, `wto` and does **not** contain `example`, `www`, `nic` or `germany`. It would not catch a single one of the names that produced the 50 % false-available finding. **Zero overlap with the failure class.** Ship it if you like; it will not move the number.

**Cheapest real flag, in order of cost:**

1. **Free, ship today: parse the RDAP 404 *body*, not just the status code.** An if-statement, zero new dependencies. Confirmed working with zero misclassifications on four backends covering **7 of the 27 TLDs**: Radix (`tech`, `store`, `online`, `site` — "This name is not available for registration: Registry Reserved"), CLOUD Registry (`cloud` — "Reserved for CLOUD Registry"), Fury (`blog` — title `01044`, "usage restrictions applied"), GMO (`shop` — "is a reserved name"). Caveat: `.shop`'s signal is the expensive one to collect (1.2 s + 429s), so take it from cache, not inline.
2. **Do not ship the `label.length <= 2 → premium` heuristic.** It is contradicted: `vc.cloud` is flagged "Reserved for CLOUD Registry" but `vc.tech` is reported by Radix as "available for registration". n=2, too small to generalise either way. At most a soft "verify before you buy" hint.
3. **One name.com key covers the other 20 TLDs.** `POST /core/v1/domains:checkAvailability` returns a `premium` boolean plus `purchasePrice` and `renewalPrice` **in the same batch call you are already making** — marginal cost zero once the key exists. DOCUMENTED, not measured.
4. **Fastly Domain Research (Status-Precise)** is the priced alternative: richest verified status vocabulary (`premium`, `reserved`, `dpml`, `claimed`, `disallowed`, `priced`, `marketed`), **one domain per request** (confirmed from the live Fastly API reference), 10,000 requests/month free then $0.001 → 25 names/search = $0.025/search = **~400 free searches/month**. DOCUMENTED.

---

## 7. What we could NOT measure — and exactly how to unblock it

**No run had a registrar API key.** Every architecture-A latency figure in circulation is an auth-rejection round trip (77–920 ms), not an availability lookup. Two vendors are worth keys.

### name.com

- **Sign up:** https://www.name.com/ → create a standard retail account (no reseller tier, no minimum spend, no funding requirement documented). *The account-creation click path itself is UNVERIFIED — I did not create an account.*
- **Get the token — VERIFIED URL:** go to **`https://www.name.com/account/settings/api`**. That page lists tokens; the sandbox one is labelled **"Development/Test Environment"**, the other is production.
- **Gates, all DOCUMENTED from live docs today:**
  - **2FA.** `docs.name.com/api/v1/overview.md` says flatly *"2FA-enabled accounts are not supported. Disable Two-Factor Authentication on your account."* The authentication guide says instead that a 2FA account must *"enable API Access in Account Settings → Security."* **The two pages contradict each other** — resolve it on the settings page. Either way, expect to weaken 2FA on a registrar account that can spend money. Real security cost.
  - Sandbox username is your username with **`-test`** appended (e.g. `reseller123-test`); base URL `https://api.dev.name.com`; verify with `curl -u your-username-test:TOKEN https://api.dev.name.com/core/v1/hello`.
  - Newly generated sandbox credentials can take **up to 15 minutes** to activate.
  - **Sandbox is useless for the benchmark that matters:** the docs state *"Availability results…don't match production"* and premium pricing differs. **The availability and premium benchmarks must run against production credentials.** Sandbox is only good for wiring the client.
  - Rate limits: **20 req/s and 3,000 req/hr account-wide**; 429 carries `Retry-After`.
  - **Semantic trap to code around from day one:** the response has **no `available` field** — only `purchasable`. Per name.com's own spec, with `purchaseType: registration`, *"Non-matching domains are returned with `purchasable: false`"*. So `false` conflates (a) registered, (b) name.com does not sell that TLD, (c) purchase-type mismatch. Mapping it to "taken" reproduces the current bug in mirror image. Map `purchasable: false` to **unknown** unless the TLD is confirmed in name.com's own catalogue, and surface `reason`.
  - **Open coverage question:** the published quickstart TLD CSV (472 entries) covers only **18 of the 27** — `ai us uk ca eu de fr jp au` are absent. The docs say the list is "not exhaustive" and point ccTLDs at a separate TLD Requirements endpoint, so this is unresolved, not disproven. It is exactly the ccTLD set the current snapshot already gets wrong.

### Spaceship

- **Get the key — VERIFIED URL:** **`https://www.spaceship.com/application/api-manager/`** → click **"New API key"**. You receive an **API key + API secret** pair, passed as `X-Api-Key` and `X-Api-Secret` headers (no encoding).
- **Gates, DOCUMENTED from docs.spaceship.dev today:** no IP whitelisting, no 2FA requirement, no verification step, no minimum spend documented. *Account creation click path UNVERIFIED.*
- **Documented limits:** `POST /v1/domains/available` accepts **1–20 domains per request** (so **27 TLDs needs 2 calls**, unlike name.com's 50); availability rate limit **30 req/user/30 s**; single-domain `GET` is capped at **5 req/domain/300 s**.
- **Caveat:** one run hit a local TLS handshake failure to `api.spaceship.dev` (curl 35, LibreSSL 3.3.6 sslv3 alert). That is this machine's TLS stack, **not a property of the service**. Treat all Spaceship behaviour as UNMEASURED.

### The exact benchmark to re-run once keys exist

1. **Coverage.** Pull the authenticated TLD/price list from each vendor. Confirm all **27** — specifically `fr`, `jp`, `ai`, `eu`, `au`, `ca`, `uk`, `de`, `us`. If any are missing, A cannot be the sole source and RDAP stays as the fallback for the gaps.
2. **Latency, the number that decides A.** Time one authenticated **27-domain** batch call against **production** (not sandbox), **n ≥ 20**, and report **p50 AND p95** against the 300 ms budget. Compare against the measured RDAP baselines in §4: 365 ms warm without `.shop`, 1207 ms with it.
3. **Correctness.** For each of the 27 TLDs, submit one known-registered and one known-free name in the same batch and confirm they come back distinguishable. This is the `.co`-class-bug detector — the failure mode where a live, well-formed endpoint answers "not found" for everything.
4. **The premium rate — closes §6.** Run ~100 real LLM-generated candidates through the authenticated call and record what fraction of `purchasable: true` answers carry `premium: true` or a `purchasePrice` above the Porkbun base price. This is the only way to produce the number §6 currently cannot.
5. **Sustained rate.** With a key in hand, a controlled ramp against one vendor is legitimate in a way it never was against registries. Establish the real ceiling before committing traffic.

---

## 8. Recommended architecture

**Ship C-hybrid now. Create the name.com key in parallel and re-run §7's benchmark before committing to A.** A-only is unsupportable today: zero measured authenticated latency, a `purchasable` field that conflates three states, and 9 of 27 TLDs outside its documented happy path. C-only is unsupportable at scale: four backends 429 at trivial volume. The hybrid is the only shape with evidence behind every leg.

**Two premise corrections to the maintainer's stated plan** — both would otherwise cost an account you may not need:

- **`.me` does not need a registrar API.** It answers correctly over `rdap.identitydigital.services/rdap/`, verified in both directions across two independent sessions. It is absent from the IANA bootstrap, so hardcode it and add a canary.
- **`.co`, `.eu` and `.jp` all answer correctly over port-43 whois** — `whois.registry.co` (272–324 ms), `whois.eu` (103–105 ms, emits a literal `Status: AVAILABLE`), `whois.jprs.jp` **with the required `/e` suffix** (607–619 ms). Prior runs concluded they were dark because they used `whois.nic.co` (does not resolve) and a generic whois client that stopped at the IANA TLD record instead of chaining to JPRS. Caveats that keep this from being free: whois rate limits and ToS are **entirely unmeasured**, and JPRS restricts use to "network administration purposes". Treat whois as the interim answer for these three and the registrar API as the durable one.

### Migration shape against `src/lib/domains.ts`

The correctness defect is in the current file and is independent of which architecture wins — fix it first, today:

- **Line 41-57: the fail-open is the real bug.** The `catch` swallows the DB error, leaves `registered` empty, and every domain then computes `available = !registered.has(...)` → `true` → a live affiliate link. A database outage currently renders 100 % available with paid links. Error must produce `unknown` and `affiliateLinks: null`.
- **Widen the result type.** `available: boolean` → `status: "available" | "taken" | "unknown"`, plus `premium?: boolean` and `reserved?: boolean`. Nothing that is not authoritatively confirmed may render as available.
- **Affiliate links only on `status === "available"` and `reserved !== true`.**
- Replace the snapshot query with a per-TLD resolver map: RDAP for 23 TLDs (hardcoding `io`, `me`, `de`, `us` — all bootstrap-absent), whois-43 or registrar for `co`/`eu`/`jp`, `.au` behind a circuit breaker, `.shop` cache-only or deadlined out.
- Wrap fetches in a shared keep-alive agent, pre-warmed at boot, with a **~300 ms per-TLD deadline** and `unknown` on timeout.
- **Validate `Content-Type: application/rdap+json` on every response, not just the status code.** `rdap.co` is a parking page returning HTTP 200 with `text/html` for every path; a status-only client marks all of `.co` taken.
- Parse the RDAP 404 **body** for the reserved string on the 7 TLDs that emit one (Radix ×4, CLOUD, Fury, GMO).
- Add an app-side result cache keyed by full domain. This is the only measured configuration that brings all 27 TLDs under 300 ms.
- Delete `"web"` from `SPECIALTY_TLDS` at `src/app/page.tsx:44`, and de-duplicate `ai`/`io`/`co`/`app` between `POPULAR_TLDS` and `CREATIVE_TLDS` while you are in the file.

### Specific risks

1. **Deployment target is unresolved and it flips the verdict.** `maxDuration = 60` (serverless) versus `docker-compose.yaml` + `next start` (persistent). Serverless with frequent cold starts means most searches pay 608–1159 ms, not 365 ms, and warm-pool RDAP reverts to NO-GO. **Resolve this before writing the resolver.**
2. **Rate limiting is the wall you will actually hit, and nobody has measured it at production rate.** Four backends throttled at single-digit-to-low-double-digit volumes. Instrument for 429 from day one and treat it as `unknown`, never `available`.
3. **`.shop` alone doubles the fan-out.** 1.13–1.20 s of pure server time on cache misses, immune to pooling. It must be cached, deadlined out, or resolved out-of-band.
4. **whois ToS and limits for `.co`/`.eu`/`.jp` are unmeasured**, and JPRS explicitly restricts commercial use. Do not ship whois into the request path at volume without confirming.
5. **name.com ccTLD coverage is unverified** for 9 of the 27 — and its sandbox cannot verify it, because sandbox availability results explicitly do not match production.
6. **Four endpoints are bootstrap-absent hardcodes** (`io`, `me`, `de`, `us`) and will fail silently if a registry moves them. Add a startup canary that queries one known-registered name per hardcoded endpoint and alerts on a non-200.
7. **`net`, `dev` and `online` have never been control-tested** — they are inferred from a same-host sibling. That is precisely the assumption that produced the live `.co` bug. Three requests closes it.