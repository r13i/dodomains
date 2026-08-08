# Architecture decision: name.com (A) vs C-hybrid — dodomains.dev domain availability

Synthesis of 6 independent replications against live api.name.com production credentials
(2026-08-07/08), ~506 credentialed requests total, plus the prior credential-free RDAP baseline.
Every figure below is tagged **MEASURED** (someone ran it), **DOCUMENTED** (name.com says so,
nobody verified), or **MODELLED** (arithmetic on top of one of the above).

---

## 0. The code fact that reframes every latency number

The brief assumes "~20-30 candidate domain names" and implies a names x TLDs cross product.
The code does neither.

- `src/lib/generate.ts:29-32` — `domainSuggestionSchema` is `.array(...).min(5).max(10)`.
  The LLM returns **5-10 suggestions, total.**
- Each suggestion is `{ name, tld }` — **one TLD per name**, chosen by the model
  (`src/lib/generate.ts:44-49`). There is no cross product anywhere.
- `src/app/api/generate/route.ts:54` passes that array straight to `checkAvailability`.
- `src/app/page.tsx:116` — `selectedTlds` defaults to `[]`, so on the default path the model
  picks TLDs from its own popular/creative list. Even when a user ticks all 28 boxes, the
  model still returns 5-10 suggestions.

**So the web route's real request is 5-10 domains spanning at most 10 distinct TLDs (8 on the
default path, where the model picks from its own popular/creative list), always one batch, never
near the 50-domain cap.** Every 2.9-3.4s headline in the six benchmarks is for a shape
(1 name x 28 TLDs) that the web route has never issued and cannot issue. The nearest MEASURED
analogue of the real shape is **543ms** (8 domains x 8 TLDs, n=1) and **751-788ms**
(28 domains x 8 popular TLDs, n=2).

**One exception: the MCP tool.** `checkDomainsTool` (`src/lib/mcp/tools.ts:49-61`) accepts an
arbitrary `domains: string[]` and passes it straight to `checkAvailability`. An MCP client can
send 1 name x 28 TLDs, or 200 domains, today. So the 2.9-3.4s shape and the multi-batch quota
arithmetic are unreachable from the web route but fully reachable from MCP — which is why s.9
caps that input.

This does not rescue the 300ms target — nothing does — but it removes the "14 batches per
search" quota problem and the "3.2 seconds" blocker entirely.

---

## 1. Verdict

**A-plus-two: name.com `domains:checkAvailability` as the sole authority for 25 of the 27 live
TLDs, RDAP for `.de` only, whois-43 (or defer to `unknown`) for `.eu`, `.web` dropped.** Not
C-hybrid, and not pure A. The number that decides it: **0 of 10 RDAP backends expose any price
or premium field — structural, RDAP has no price concept (MEASURED)** — so C-hybrid physically
cannot implement the premium/reserved flag the maintainer has already decided to ship, while
name.com returns `premium:true` with a real `purchasePrice` on 12/12 dictionary rows and 9/28
short coined rows (MEASURED). The supporting number is throttling: **0 x 429 in 506 credentialed
name.com requests including 60 at a sustained 20.2 req/s (MEASURED)**, against **4 of 10 RDAP
backends 429ing at trivial volume, `.au` in 9-35ms on its first request (MEASURED)**.

---

## 2. A vs C-hybrid, head to head

| | **A — name.com** | **C-hybrid — self-hosted RDAP + whois-43** |
|---|---|---|
| **Coverage /28** | **25/28 MEASURED.** Blind: `.de`, `.eu`, `.web`. After dropping `.web`: **25/27 live TLDs.** 3 of the 25 (`au`, `fr`, `jp`) flap into false-negatives and need canary gating. | **28/28 MODELLED.** MEASURED-reliable is **~24/27**: `.co` RDAP 404s everything including `google.co` (silent false-*available*, the worst failure mode); `.jp` `rdap.jprs.jp` dead (000); `.au` 429s on first request. **The whois-43 leg for co/eu/jp appears in zero of the six benchmarks — entirely UNMEASURED.** |
| **p50 ms — app's real shape** (5-10 domains, <=8 TLDs) | **543ms** MEASURED (8 domains x 8 TLDs, n=1); 751-788ms (28 x 8 TLDs, n=2); 425ms single domain (n=2) | **No measurement at this shape.** Nearest MEASURED: 89-121ms single `.com` incl. TLS. A 5-10 way parallel fan-out would plausibly land ~150-300ms — **MODELLED, and it is the one place C-hybrid probably wins.** |
| **p50 ms — 1 name x 27-28 TLDs** (the RDAP baseline shape) | 2942ms (n=20), 2983ms (n=20), 3272ms (n=8), 3429ms (n=5) — all MEASURED, replicated 4x within 17% | **1207ms** MEASURED warm keep-alive; **365ms** with the `.shop` registry deadlined out |
| **p95 ms** | 4712ms (n=20) and 5463ms (n=20) MEASURED, **at the 28-TLD shape only**. **No p95 was ever measured at the app's real shape** — a gap. | Not measured. Cold process 608-1528ms MEASURED. |
| **Premium flag?** | **YES — MEASURED.** `premium:true` + `purchasePrice` + `renewalPrice`, verified live on this account, stable across a byte-identical re-send (0 differences on 50 rows). | **NO — STRUCTURAL.** 0 of 10 RDAP backends expose any price or premium field. Not a gap to close; RDAP has no price concept. |
| **Rate ceiling (searches/day)** | MEASURED: 20.2 req/s sustained x 60 requests and 20 concurrent in 1s, **0 x 429**, across 506 requests. Ceiling **above** 20 req/s is UNMEASURED (protocol forbade exceeding the documented cap). DOCUMENTED 3000 req/hr. At **1 request/search** (see s.8) that is **3000 searches/hr = 72,000/day MODELLED**. | No sustainable ceiling was ever measured. MEASURED negative: 4 of 10 backends 429 at trivial volume; `.au` 429s in 9-35ms on the **first** request. Per-backend circuit breakers are mandatory, which means degraded coverage is the steady state, not the exception. |
| **Ops burden** | 1 vendor, 1 credential, 0 backends to operate. **But**: no `X-RateLimit-*` or `Retry-After` on any of 506 responses (MEASURED) so quota is invisible; and rows are silently omitted from HTTP 200 responses (MEASURED) so every response must be set-diffed against the request. | 26 registry backends + a whois-43 TCP/43 path + per-backend circuit breakers. `io`, `ai`, `co` have **no IANA RDAP bootstrap entry** (MEASURED) so their endpoints must be hardcoded and will silently rot. `.shop` registry alone is 1120-1197ms (MEASURED). Two of six agents fabricated false-negatives by using the wrong RDAP base URL — this class of bug is endemic. |
| **Cost/mo** | **MODELLED $0.** 506 read-only requests, 0 billable calls, reseller API. Not independently verified against a name.com invoice. | **MODELLED $5-20.** whois-43 needs raw outbound TCP/43, which Vercel's Edge runtime cannot open, so it implies a small always-on host plus RDAP egress. **UNMEASURED.** |

**Why not pure A:** `.de` and `.eu` are silently omitted from HTTP 200 responses and return
HTTP 422 when sent alone — MEASURED on two separate days, 7/8 and 20/20 and 23/23 runs. This is
recurrent, not transient. RDAP handles `.de` and `.fr` fine (MEASURED in the baseline), so `.de`
costs one RDAP leg. `.eu` has no working name.com path and no RDAP path in the baseline; it is
the single genuine whois-43 case.

**Why not C-hybrid:** it cannot produce the premium flag at all, it 429s on four backends at
volumes this app will exceed, and its two "solved" ccTLDs (`co`, `jp`) rest on a whois-43 leg
that nobody has measured even once.

---

## 3. The 28-TLD coverage table

Sold / discriminates from MEASURED two-direction tests (registered names -> `purchasable:false`,
fresh DNS-verified-free names -> `purchasable:true`): 25/25 correct in rep1, 21/21 registered
correct in rep5, replicated across all six runs. Prices are `registrationPrice` -> `renewalPrice`
from `/tldpricing` and from live `checkAvailability` rows.

| TLD | name.com sells? | Discriminates both directions? | Price (reg -> renew) | vs RDAP |
|---|---|---|---|---|
| com | Yes | **Yes** MEASURED | $12.99 flat | RDAP faster (89-121ms vs 417ms MEASURED) |
| net | Yes | **Yes** | flat | RDAP faster |
| org | Yes | **Yes** | $8.49 -> $19.99 | RDAP faster |
| io | Yes | **Yes** | $53.99 | **name.com better** — no IANA bootstrap entry for `.io`, RDAP base must be hardcoded |
| **co** | Yes | **Yes** (490ms MEASURED) | $4.99 -> ~9.0x | **name.com WINS OUTRIGHT** — `rdap.registry.co` 404s everything incl. `google.co`, i.e. RDAP silently reports every `.co` as available |
| app | Yes | **Yes** | — | Parity; RDAP base is `pubapi.registry.google` (not `www.registry.google`, which 404s) |
| dev | Yes | **Yes** | — | Parity |
| **ai** | Yes | **Yes** | tldpricing `null`, `checkAvailability` quotes **$199.98** | **name.com better** — no IANA bootstrap entry |
| me | Yes | **Yes** | flat | Parity |
| xyz | Yes | **Yes** | $1.99 -> ~10.5x | Parity |
| tech | Yes | **Yes** | ~6.4x renew | Parity (RDAP operator is Radix, not Identity Digital — a common wrong-base trap) |
| design | Yes | **Yes** | $19.99 -> $80.99 | Parity |
| us | Yes | **Yes** | $7.99 -> $18.99 | Parity |
| uk | Yes | **Yes** (511ms) | $9.99 -> $11.99 | Parity |
| ca | Yes | **Yes** | $16.99 flat | name.com **slow**: p50 1746ms solo (n=5), max 5939ms. RDAP `.ca` unmeasured. |
| **eu** | **NO — blind** | **No.** Omitted from 200s in 22/23, 19/20, 7/8 runs; HTTP 422 alone. Answered once at $10.99. | $10.99 listed but unusable | **name.com WORSE.** No RDAP measurement either. **This is the whois-43 case.** |
| **de** | **NO — blind** | **No.** Omitted 20/20, 23/23, 7/8 runs; 422 alone. Includes `google.de`, `bmw.de`. | $19.99 listed but unusable | **name.com WORSE — RDAP handles `.de` fine (MEASURED baseline). Route `.de` to RDAP.** |
| fr | Yes | **Mostly** — 1/23 and 1/17 fresh-free names returned false, flipped true on re-probe | $17.99 | RDAP handles `.fr` fine. name.com adequate with canary gating. |
| **jp** | Yes (1448ms p50, n=5) | **Mostly** — same flap class | $55.99 | **name.com WINS** — `rdap.jprs.jp` returned 000 for two independent agents |
| **au** | Yes | **Flaky** — a ~40min window where 7/7 fresh RDAP-404-confirmed-free names returned `purchasable:false`; also composition-dependent (false in small/uniform batches, true in 22+ TLD batches) | **$23.99** — and `.au` is **absent from /tldpricing entirely** | **name.com WINS on availability** — RDAP `.au` 429s in 9-35ms on the first request — but both are unreliable. Canary-gate it. |
| store | Yes | **Yes** | $2.99 -> **25.4x** | Parity |
| shop | Yes (893ms) | **Yes** | -> **20.1x** | **name.com better** — `rdap.gmoregistry.net` alone is 1120-1197ms, the single worst RDAP leg |
| blog | Yes (646ms, n=5) | **Yes** | $5.99 -> $37.99 | Parity |
| online | Yes | **Yes** | -> **16.7x** | Parity |
| site | Yes | **Yes** | $2.99 -> $49.99 | Parity |
| **web** | **NO** — 422 alone, omitted 20/20 and 17/17; **absent from the 599-TLD /tldpricing catalog** | n/a | n/a | **Drop it.** name.com independently confirms it is unsellable. |
| digital | Yes | **Yes** | $3.99 -> $54.99 | Parity |
| cloud | Yes | **Yes** | $39.99 flat | Parity |

**Where name.com beats RDAP: `co` (RDAP structurally broken), `jp` (RDAP dead), `au` (RDAP 429s
instantly), `shop` (RDAP 5-10x slower), `io` / `ai` (no IANA bootstrap entry).**
**Where name.com is worse: `de` and `eu` (blind), plus raw single-lookup speed on `com`/`net`/`org`.**

**Do not use `/tldpricing` as a sell-list or a routing preflight** (MEASURED, replicated 3x):
`.au` has no pricing row yet sells at $23.99; `.ai` has a row with `registrationPrice: null` yet
quotes $199.98; `.de` and `.eu` are priced yet permanently blind. It is a **display fallback only.**

---

## 4. Latency verdict

**Is <300ms achievable with one batch call? No — and not by tuning.**

The blocking MEASURED fact: **`GET /core/v1/hello`, an endpoint that does zero work, costs
253-272ms** (n=9 across two independent runs; TCP connect 7.5-9.9ms, TLS 17-25ms). So roughly
235-250ms of fixed cost is spent before any name.com endpoint does anything. No name.com call
fits in 300ms with any margin worth having.

MEASURED latency by shape:

| Shape | p50 | n | Note |
|---|---|---|---|
| **App's real shape — 8 domains x 8 TLDs** | **543ms** | 1 | The number that matters. n=1 — weakest sample in this report. |
| 28 domains x 8 popular TLDs | 751 / 788ms | 2 | |
| 28 domains, all `.com` | 725ms | 3 | Isolates: cost is TLD fan-out, not domain count |
| 1 domain | 425 / 426ms | 2 | Floor for a real query |
| 50 domains, all `.com` | 1081ms | 1 | |
| **1 name x 28 TLDs** | **2942-3429ms** | 20/20/8/5 | Replicated 4x. **The app never issues this shape.** |
| `zonecheck`, 28 domains | 285-290ms | 10/20/9/8 | Replicated 4x. Disqualified on correctness — s.6. |

**Against the RDAP baselines, apples to apples:**

- **On the RDAP baseline's own shape (1 name x 27 TLDs): name.com loses outright.** 2942-3429ms
  vs 1207ms warm fan-out = **2.4-2.8x slower**; vs 365ms deadlined = **8-9x slower**. No trim
  rescues it — 22 TLDs minus ca/jp/shop = 1220ms; 8 popular TLDs = 545ms; a single `.com` = 417ms.
- **On the app's actual shape, there is no RDAP measurement.** 543ms for name.com vs a MODELLED
  ~150-300ms for a 5-10 way RDAP fan-out. Do not read 543ms as a win; read it as "good enough,
  and it is the only path that also returns a price."

**Recommendation: drop the 300ms target.** Budget **~550-800ms p50** for the default path and
render progressively. Hard-deadline the batch at **2500ms**, or **5000ms** if the selected TLD
set includes `ca` or `jp` (MEASURED solo: `ca` p50 1746ms / max 5939ms, `jp` p50 1448ms).
Anything past the deadline is `unknown`, never `taken`.

**Caveat that undercuts every number above:** all six benchmarks ran from macOS laptops behind
Cloudflare's ARN/edge. **Nobody has ever timed api.name.com from a Vercel region.** ~235-250ms of
the floor is origin-side and therefore probably portable, but that is inference, not measurement.

---

## 5. The premium number

This is the question the maintainer could not answer before. It is answered, and the answer is
**"it depends almost entirely on label length"**.

**Premium rate among `purchasable:true` results (MEASURED):**

| Cohort | Premium rate | n |
|---|---|---|
| **Coined labels, 6-11 chars** | **0 / 90 = 0.0%** | 100 sent, 95 returned, 90 purchasable |
| Coined labels, 5-6 chars | 2 / 19 = 10.5% | 19 |
| Coined labels, 4 chars | 3 / 5 = 60% | 5 |
| Coined labels, 3 chars | **4 / 4 = 100%** | 4 |
| Coined, 3-6 chars (blended) | 9 / 28 = 32.1% | 28 |
| **Both coined cohorts blended** | **9 / 118 = 7.6%** | 118 |
| **Dictionary words in premium-heavy TLDs** | **6 / 6 = 100%** | 6 purchasable of 25 sent |
| Dictionary words, mixed TLDs (independent run) | **12 / 12 = 100%** | 12 |

The 0/90 is a real zero, not a broken field: the dictionary control fired 6/6 in the same session,
and the flag was stable across a byte-identical re-send (0 differences on 50 rows).

**Price distribution — genuinely registerable premium (`purchaseType: "registration"`):**
**$123.75 to $7,812.50** MEASURED. Named examples: `travel.online` $7,812.50 (renews $31,250),
`hotel.store` $7,812.50 (renews $31,250, RDAP-confirmed genuinely free), `head.co` $5,250,
`golf.xyz` and `look.xyz` $3,807.69, `coffee.store` $3,125 (renews $12,500), `games.cloud` $2,500,
`jacket.store` $1,562.50, `garden.shop` $1,250, `cool.dev`/`date.dev`/`menu.dev` $811.25,
`photo.design` $812.50.

**A separate and more dangerous price class — aftermarket resales of REGISTERED domains,
returned as `purchasable:true`:** `mail.online` **$718,750** (`aftermarket_s`, RDAP: registered
2021), `xn--bcher-kva.com` **$195,314.85**, `trailing.com` **$57,498.85**, `firstsummit.com`
$5,621.20, plus `hubbly.com` / `asideu.com` / `glaky.com`. **6/6 independently RDAP-verified as
registered.** These are TAKEN, not premium-available. Census over 796 rows: `registration` 759,
`aftermarket_s` 1, `aftermarket_b` 1, not-purchasable 35 — so ~0.25% of rows, but they carry
five- and six-figure prices and would render an identical-looking "register this" affiliate link.

**Per-TLD:** the sample is too small for a per-TLD premium *rate*. What is MEASURED is *which*
TLDs produced premium hits: `store`, `online`, `cloud`, `shop`, `design`, `co`, `xyz`, `dev`.
Flat/no premium observed: `com`, `net`, `org`, `io`, `ai`, `me`, `ca`, `uk`.

**The bigger trap the maintainer did not ask about — renewal price.** Premium hits 7.6% of coined
results; the renewal cliff hits **100%** of available names in these TLDs, and `renewalPrice` is
already in the same response at zero extra cost (MEASURED, n=118 purchasable rows; per-TLD n in
parentheses):

`store` **25.4x** (7) - `shop` **20.1x** (7) - `online` **16.7x** - `digital` **13.8x** (6, $3.99 -> $54.99) - `xyz` **10.5x** (8) - `co` 9.0x - `tech` 6.4x - `blog` 6.3x ($5.99 -> $37.99) - `site` ($2.99 -> $49.99) - `design` 4.1x (8, $19.99 -> $80.99).
Flat (1.0-1.5x): `com` (15), `dev`, `io`, `net`, `ai`, `me`, `ca`, `cloud`, `uk`.

**Recommendation:** ship the premium flag as decided, and ship a renewal warning alongside it
(`renewalPrice / purchasePrice >= 4`). The renewal warning will fire far more often and prevent
far more bad purchases than the premium badge.

**Note on "reserved" — half the decided flag cannot be populated from name.com.** MEASURED:
registered `google.com` and registry-reserved `vad.store` / `viv.io` (both RDAP 404 = not
registered) return the **identical** `{domainName, purchasable:false, sld, tld}` shape. No field
discriminates them. **Reserved must fold into `taken`** — which is the correct user-facing
behaviour, since no affiliate sale is possible either way — and per-name reserved detection would
cost an RDAP round trip per candidate. Name this trade-off in the UI copy rather than promising a
distinct "reserved" state the data cannot support.

---

## 6. zonecheck

**Does it replace the Postgres snapshot? The snapshot dies either way — `checkAvailability` alone
is enough to delete it. zonecheck is not needed for that, and should not ship in v1.**

MEASURED in its favour, replicated 4x:

- p50 **285-290ms** (n=10, 20, 9, 8), ~270ms warm. Flat in batch size: 200 domains in **one**
  request also 287ms; 100 domains 290ms.
- Explicit tri-state contract: `available: true | false | null`, plus a top-level `removed` count.
  Unknown is something the API *tells* you, versus `checkAvailability`'s silent row omission.
- Deterministic: 90 calls returned the identical 20-true / 6-null / 2-removed shape, zero flapping.
- **Agreement with `checkAvailability`: 436/438 = 99.54%** (400 fresh-name comparisons + 38
  designed ground-truth comparisons). **Both disagreements were `checkAvailability` aftermarket
  listings — zero were attributable to zonecheck.**
- 0 false-negatives across 160 fresh-label observations. 0 false-availables on 35 delegated
  registered domains. It is not a naive zone-file lookup — it correctly calls trademark-reserved
  but unregistered names (`hackster.tech`, `wix.site`, `adobe.digital`) unavailable.

**What disqualifies it as an authority (MEASURED):**

**4 of 27 RDAP-verified REGISTERED domains returned `available: true` — 14.8%.**
`jurevis.com` (`clientHold`), `moyite.com` (`serverHold`), `sumpage.com` (`redemptionPeriod`),
`tarrack.com` (`pendingDelete`). Mechanism: hold / redemption / pending-delete strip a domain
from the zone file while it is still owned. `checkAvailability` got **0/27** of the same set wrong.

This is the exact failure class the current Postgres snapshot has — "absent from my data
therefore available" — reproduced at 14.8% on a fresher data source. Three prior agents flagged
it as untested; one attempted it with an invalid method (`dig +short NS` reads the child zone,
not the parent delegation) and said so; the sixth built a valid funnel and it failed.

**Coverage is also short:** 20/28 answered, 6 permanently `null` (`uk ca eu de fr jp`), 2 removed
(`au web`) — identical across 8, 10 and 20-run samples. It blanks 7 of the app's 8 country TLDs.

**Verdict: skip zonecheck in v1.** At 5-10 domains per search, `checkAvailability` is already one
request at ~543ms; inserting a 285ms serial prefilter that answers 20/28 TLDs and cannot be
trusted on `available: true` buys nothing and costs a request from the hourly budget. Revisit only
if quota becomes binding, and then only as a provisional paint layer whose `available: true`
never renders an affiliate link. **`available: false` and `null` are trustworthy and could safely
short-circuit a cache warm.**

*One caution against my own recommendation:* zonecheck's cache refreshes **twice daily** — that
is DOCUMENTED in the OpenAPI spec, never measured.

---

## 7. The purchasable decision table

Match rows by **normalized `domainName`**. **Never zip by index** — the response array is shorter
than the request array whenever a blind TLD is present (MEASURED 6/6, 19/20, 7/8 runs), and
`zonecheck` additionally sorts alphabetically and silently de-duplicates.

| # | Response condition | State | Affiliate link? |
|---|---|---|---|
| 1 | `purchasable:true` + `purchaseType === "registration"` + `premium` falsy | **available** | Yes |
| 2 | `purchasable:true` + `purchaseType === "registration"` + `premium:true` | **available (premium)** | Yes — **must** show `purchasePrice` and `renewalPrice`, never the `/tldpricing` base |
| 3 | `purchasable:true` + `purchaseType` starts with `"aftermarket"` | **taken** | **NEVER** |
| 4 | `purchasable:true` + `purchaseType` absent or unrecognized | **unknown** | No |
| 5 | `purchasable:false` **and** this TLD's canary in the same batch came back `true` | **taken** (registered *or* registry-reserved — indistinguishable, see s.5) | No |
| 6 | `purchasable:false` **and** this TLD's canary also came back `false` or was absent | **unknown for the entire TLD** | No |
| 7 | Domain requested but **absent** from an HTTP 200 response | **unknown** | No |
| 8 | HTTP 422 / any non-200 / timeout / connection failure | **unknown for every domain in the batch** | No |
| 9 | Returned `domainName` != normalized requested name | **unknown** | No |

**The combinations that MUST map to `unknown` — this is the whole point of widening the type:**

- **Rows absent from a 200 response** (rule 7). `.de` and `.eu` hit this on essentially every
  request. Mapping absence to *available* is today's bug; mapping it to *taken* is the same bug
  in mirror image.
- **`purchasable:false` when the TLD's canary is also false** (rule 6). This is the rule that
  saves `.au`, `.fr`, `.jp`. MEASURED: 8/8 ccTLD `purchasable:false` answers across two
  independent days were false negatives that returned `true` on re-probe; separately 7/7 fresh
  RDAP-404-confirmed-free `.au` names read `false` for ~40 minutes. **Do not ship "`false` +
  the TLD returned some other result therefore taken"** — that test passes during a degraded-TLD
  event and produces confident wrong "taken" labels on genuinely free names.
- **Any non-200, including HTTP 422** (rule 8). 422 reads like a client validation error
  (`"None of the submitted domains are valid"`) but is a backend failure: the same fresh `.de`
  label 422s alone and returns 200 / `purchasable:true` / $19.99 when paired with a `.com`.
- **`purchasable:true` with an unrecognized `purchaseType`** (rule 4) — fail closed on new enum
  values rather than rendering a link.
- **Any name mismatch after normalization** (rule 9).

**Canary design — and why it must be in-batch, not a shared health probe.** `purchasable` is
composition-dependent (MEASURED, deterministic within a run: the identical fresh `.au` label
returned `false` in a 25-domain uniform batch and `true` with a $23.99 price in a 22/25/28-TLD
diverse batch, seconds apart). A separately-shaped health-probe request would therefore report
`.au` healthy while the app's own smaller batch gets `false`. **Health must be observed in the
same batch composition.** The canary is a **detector, not a fix** — padding a `.au` batch with one
`.com` does not repair `.au` (MEASURED: 3 `.au` + 1 `.com` -> `.com` true, all `.au` false).

**Canary cost at this app's scale is effectively zero:** the search is 5-10 domains spanning at
most 10 distinct TLDs, so 5-10 canary slots ride in the same single sub-50 request. **No extra
request, no extra round trip.** (This is only cheap because of s.0 — at a 28-TLD cross-product
shape, per-batch canaries would consume 28 of 50 slots and blow the hourly quota. See s.8.)

**Batching rule: always chunk by NAME, never by TLD.** Every batch then spans the search's full
TLD set, which is the composition measured to behave correctly. Chunking by TLD produces uniform
batches — exactly the shape that makes `.au` lie.

---

## 8. Rate limits and scale

**MEASURED ceiling:**

- **0 x 429 across ~506 credentialed requests** aggregated over six independent runs
  (146 + 139 + 86 + 79 + 35 + 21), including runs that overlapped on the same shared account.
- **60 requests at a sustained 20.2 req/s with full 28-domain payloads: 0 x 429**, p95 416ms.
- **20 concurrent requests inside 1 second: 0 x 429**, p50 326ms.
- **Zero rate-limit telemetry.** No `X-RateLimit-Limit`, `-Remaining`, `-Reset`, no `Retry-After`
  on any response, verified with header dumps in five of the six runs. The client cannot observe
  its budget and will discover the ceiling only by being rejected.
- Latency **does** degrade under concurrency even without 429s: `checkAvailability` at 10-way
  concurrency went to p50 4365ms / max 7352ms vs a 3002ms sequential median (28-TLD shape).
  `zonecheck` stayed flat at p50 326-387ms.

**UNMEASURED:** the actual throttling point above 20 req/s — every run's protocol forbade
exceeding the documented cap. **DOCUMENTED, never measured:** 20 req/s and **3000 req/hour**
(`docs.name.com/api/v1/overview.md`), account-wide and shared with every other consumer of the
credential.

**Where it breaks — MODELLED arithmetic on the documented 3000/hr:**

| Shape | Domains/search | Requests/search | Searches/hr | Searches/day |
|---|---|---|---|---|
| **Today's web route** (5-10 suggestions + 5-10 canaries) | **10-20** | **1** | **3000** | **72,000** |
| If suggestions were raised to 30 + canaries | ~38 | 1 | 3000 | 72,000 |
| If a names x TLDs cross product were ever introduced: 25 names x 8 TLDs + 8 canaries | 208 | 5 | 600 | 14,400 |
| Cross product at 25 names x 28 TLDs + 28 canaries | 728 | 15 | ~200 | ~4,800 |

**The 3000/hr cap is not a constraint for this app as built** — it breaks at ~3000 searches/hour,
which is far beyond plausible traffic. **It becomes the binding constraint the moment anyone
introduces a names x TLDs cross product**, dropping the ceiling ~15x to ~200 searches/hour. That
is the single design change that would turn quota into the blocker; treat it as a decision that
requires re-running this analysis.

**How to raise it — honestly, there is no measured path.** Options in order of confidence:
(1) cache aggressively so repeat searches cost nothing (see s.9 — this is the only lever fully
under our control); (2) keep suggestions at 5-10 and never cross-product; (3) ask name.com to
raise the reseller quota — **no published path exists** (MEASURED absence, checked in two runs);
(4) a second reseller account — **untested**, and likely against terms. Because there is no
`X-RateLimit-Remaining` to read, the app must run its **own** counters: a token bucket at
**15 req/s** (25% under the documented 20) and an hourly leaky bucket at **2500/hr** (17% under
the documented 3000).

---

## 9. Implementation plan for `src/lib/domains.ts`

*Shape and decisions only, no code.*

### 9.1 The new result type

Replace `DomainResult { name, available: boolean, affiliateLinks }` with a verdict record
carrying, per domain:

- **`status`** — the widened `"available" | "taken" | "unknown"`. This is the only field the UI
  branches on.
- **`reason`** — a required discriminator whenever `status` is not `"available"`. For `taken`:
  `"registered-or-reserved"` (rule 5 — the two are indistinguishable, s.5) or `"aftermarket"`.
  For `unknown`: `"tld-unsupported"` (`de`/`eu` until their legs ship), `"row-absent"`,
  `"tld-degraded"` (canary failed), `"upstream-error"`, `"timeout"`, `"rate-limited"`,
  `"name-mismatch"`, `"unrecognized-purchase-type"`. Reason codes are what make the "unknown"
  state debuggable in production instead of a black hole; log their distribution.
- **`premium: boolean`** — never assume the key exists; the field is **absent**, not `false`,
  when a domain is not premium (MEASURED).
- **`registerPrice` / `renewPrice`** — nullable, USD. Populated only from the live
  `checkAvailability` row, never from `/tldpricing` (s.3).
- **`renewalWarning: boolean`** — derived, `renewPrice / registerPrice >= 4`. Fires on 100% of
  available `.store`/`.shop`/`.online`/`.digital`/`.xyz` names (s.5).
- **`source`** — `"namecom" | "rdap" | "cache"`, for observability.
- **`affiliateLinks`** — **structurally non-null only when `status === "available"`.** Encode this
  in the type (a discriminated union on `status`) so the "render a buy link for a domain someone
  else owns" bug becomes uncompilable rather than a code-review item.

### 9.2 Resolver shape

- A **TLD -> resolver registry**: `namecom` for the 25 working TLDs, `rdap` for `de`,
  `whois43` for `eu` (or, for v1, a `unsupported` resolver that returns `unknown` /
  `"tld-unsupported"` — shipping `.eu` as honestly unknown is strictly better than today's
  confident wrong answer, and defers the only unmeasured leg).
- Group the search's suggestions by resolver; run resolvers **in parallel** with **independent
  per-resolver deadlines**; `Promise.allSettled`, and any rejection maps its whole group to
  `unknown` rather than propagating.
- **name.com resolver:** append one fresh random canary label per distinct TLD in the group
  (s.7 — free at this batch size), chunk by NAME at 50, reconcile responses by normalized
  `domainName`, set-diff request vs response, apply the s.7 table.
- **Deadline:** 2500ms default; 5000ms if the group contains `ca` or `jp`. Past deadline ->
  `unknown` / `"timeout"`. **Never retry inside the user's request** — a retry doubles the worst
  case past any deadline the user will tolerate.

### 9.3 Error handling — the fail-open bug

`src/lib/domains.ts:50-62`: the `catch` logs and falls through with an empty `registered` set, so
**every domain is reported `available: true` during an outage** and every one gets an affiliate
link. This is the same defect as the stale snapshot, just triggered by a different cause.

- **Delete the `onDbError: "assume-available" | "throw"` parameter entirely.** Its existence
  encodes a choice between two wrong answers. With `unknown` as a first-class state there is one
  correct behaviour: **any failure maps that domain to `unknown` with a reason code.**
- The MCP tool (`src/lib/mcp/tools.ts:61`) currently passes `"throw"` specifically to avoid
  lying during an outage. It no longer needs to — it gets `status: "unknown"` plus a reason,
  which is strictly more useful to a model than an exception. Update `checkDomainsTool` to
  surface `status`/`reason` instead of a boolean, and keep `registrationUrls` null unless
  `available`.
- **On 429:** whole batch -> `unknown` / `"rate-limited"`. **Circuit breaker:** 5 consecutive
  non-200s opens the name.com resolver for 30s; while open, every name.com-routed domain returns
  `unknown` immediately with no network call. The page still renders — that is the point of the
  third state.
- **Fail closed everywhere.** No code path may produce `"available"` from an error, a timeout, an
  absent row, or a missing field.
- **Cap the MCP input.** `checkDomainsTool` (`src/lib/mcp/tools.ts:49-61`) takes an unbounded
  `domains: string[]`, so it is the one path that can issue the 1-name-x-28-TLD and multi-batch
  shapes the web route cannot (s.0). Cap it at **~50 domains** (one batch, matching the API's own
  limit) and reject the overflow rather than silently truncating. It shares the resolver, so it
  inherits canaries, chunk-by-name and fail-to-unknown automatically — the cap is only there to
  bound its worst-case latency and its draw on the shared hourly quota.

### 9.4 Caching

Three independent layers, all keyed and TTL'd differently:

- **Per-domain verdict cache.** `taken` -> 6-24h (MODELLED; registered names rarely free up, but
  redemption/drop cycles exist so do not go longer). `available` -> **60-300s only** — this is the
  state that carries a money link, and a stale "available" is the exact user-facing failure being
  fixed. `unknown` -> do not cache, or 10s at most to avoid hammering a degraded TLD.
- **TLD health (canary outcome)** -> per search, not shared. Composition dependence (s.7) means a
  cached health verdict from a differently-shaped batch is not valid for this batch.
- **`/tldpricing`** -> 24h, **display fallback only, never routing** (s.3).

Note that name.com caches on its side too — a repeated label cut a 25-TLD batch from 2994ms to
611ms (MEASURED). **The app gets no benefit from this**: LLM-generated candidates are novel by
construction. Our own cache only pays off on repeated *searches*, which is also the only lever
that raises the effective quota ceiling (s.8).

### 9.5 UI and TLD-list changes

- **`src/app/page.tsx:45` — remove `"web"` from `SPECIALTY_TLDS`.** name.com independently
  confirms it: 422 when sent alone, omitted 20/20 and 17/17 in batches, and **absent from the
  599-TLD `/tldpricing` catalog** — the only one of the 28 that is absent, which is the actual
  discriminator for "not sold" (as opposed to `.de`/`.eu`, which are priced but blind).
- **Duplicate TLDs across the category lists.** `POPULAR_TLDS` (`page.tsx:36`) and
  `CREATIVE_TLDS` (`page.tsx:37`) share **four**: `ai`, `io`, `co`, `app`. That is why 32
  checkboxes yield 28 unique TLDs — 27 after dropping `.web`. `toggleTld` (`page.tsx:169-175`)
  guards with `includes()`, so **this cannot put a duplicate into `selectedTlds` — it is a
  cosmetic defect, not a correctness one.** Fix by trimming `CREATIVE_TLDS` to
  `["me", "xyz", "tech", "design"]` so each TLD owns exactly one checkbox. Low priority; do not
  let it delay the availability work.
- **A real inconsistency worth fixing: `src/lib/generate.ts:7` defines its own
  `POPULAR_TLDS = [com net org io co app dev]` — seven entries, missing `ai` — while
  `page.tsx:36` shows eight including `ai`.** The model is prompted with a different popular
  list than the UI displays. Export one shared constant and import it in both.
- **Stop generating names in TLDs we cannot verify.** Until the `.de` RDAP leg and the `.eu`
  whois-43 leg exist, remove `de` and `eu` from the TLD pool the model is allowed to choose from
  in `generate.ts`, and (if you want to be strict) from `COUNTRY_TLDS` at `page.tsx:38`.
  Generating a `.de` suggestion that can only ever render as "unknown" is a worse experience
  than not generating it.
- **Three-state UI.** `page.tsx:781-787` currently branches green/red on `domain.available`;
  `page.tsx:107` types it as `available: boolean`; `page.tsx:763-767` has an "Available" tab
  filtering `d.available`; `page.tsx:282-283` reports `available_suggestion_count` to PostHog.
  All four move to `status`. Add an amber `unknown` presentation with copy that says *we could
  not verify this one* — not *taken*. Keep the affiliate link gated on `status === "available"`
  and nothing else. Consider sorting `available` > `unknown` > `taken` ahead of the existing
  score sort at `route.ts:57-60`.

---

## 10. Residual risks and what is still unmeasured

**Measured risks that survive into production:**

1. **`.au` / `.fr` / `.jp` false negatives — and `.au` may be *chronically*, not episodically,
   unknown at this app's batch size.** The flapping itself is replicated across three independent
   runs (8/8 flipped on re-probe; 7/7 during a ~40-minute episode; 3/23, 1/23, 1/23 rates
   elsewhere), and the canary rule contains it safely. But the composition-dependence measurement
   is more troubling than an episode: `.au` read `false` at **5 diverse TLDs**
   (`[au,ca,jp,shop,com]`) and at 1 `.au` + 24 `.com`, and read `true` with a price only at
   **22+ diverse TLDs**. **The web route's real batch — 10-20 domains over 5-10 TLDs — sits
   entirely inside the measured-false regime.** The honest expectation is that `.au` reads
   `unknown` on most searches, not occasionally. The threshold between 5 and 22 TLDs was never
   probed, and per-TLD canaries do themselves add TLD diversity and might push the batch toward
   the good regime — plausible, unmeasured, do not rely on it. **The base rate is unquantified;
   if `.au` is chronically unknown that is a product decision (keep it and label it honestly, or
   drop it from the TLD pool), not a bug.**
2. **`.de` / `.eu` blind, recurrent not transient.** Observed across two separate days,
   20/20 / 23/23 / 7/8 runs. `.eu` answered exactly once in 20 and once in 23 runs. Assume
   permanently unusable via name.com.
3. **Aftermarket listings priced at $5.6k-$718k returned as `purchasable:true`.** Contained by
   rule 3, but it is a single enum check standing between the app and a link to buy someone
   else's domain. Add a test.
4. **Invisible quota.** No rate-limit headers on any of 506 responses. The 3000/hr cap is
   DOCUMENTED only and shared account-wide; the app is flying blind and must self-count.

**Unmeasured — ranked by how much it would change the decision:**

1. **The Vercel-region latency floor. Nobody has ever timed api.name.com from the region the app
   deploys to** — all six runs were macOS laptops behind Cloudflare's ARN/edge. TCP 7.5-9.9ms and
   TLS 17-25ms mean ~235-250ms of the 253ms floor is origin-side and *probably* portable, but that
   is inference. **This is one cheap curl from a Vercel function and it should be run before any
   code is written.**
2. **p95 at the app's real shape.** Every p95 in this report (4712ms, 5463ms) is from the 28-TLD
   fan-out the app never issues. The real shape has **n=1** at 543ms and no tail measurement at
   all. The 2500ms deadline is set from adjacent shapes, not from a measured distribution.
3. **The whois-43 leg.** Zero of the six benchmarks touched it. C-hybrid's coverage claim rests
   entirely on it; so does any future `.eu` support. Treat "whois-43 solves co/eu/jp" as an
   untested assertion.
4. **The real throttling ceiling above 20 req/s**, and whether 3000/hr is enforced as documented.
5. **The registered-but-undelegated false-available class beyond `.com`.** zonecheck's 4/27 and
   `checkAvailability`'s 0/27 were both measured on `.com` only. `checkAvailability` being 0/27
   is the load-bearing reason it is the authority — that result has not been reproduced on any
   other TLD.
6. **`purchasable` composition dependence** was measured by one agent (n=2 per condition,
   deterministic within the run) and not independently replicated. The in-batch canary makes the
   architecture correct whether or not the mechanism is real, which is why it is worth its cost.
7. **The "degraded batch" event** — one agent recorded a 14.27s call returning `purchasable:false`
   for 25 of 26 never-registered fresh names under HTTP 200. Two other agents specifically looked
   for it in 20 and 20 calls and did not reproduce it. If real, it is a mass false-negative event;
   the canary catches it. Reported as observed, not confirmed.
8. **Cost.** No name.com invoice was examined. $0 is an assumption about reseller API access, not
   a measurement.