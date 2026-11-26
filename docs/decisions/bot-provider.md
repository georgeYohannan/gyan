# Who sends the bot to the meeting

**Checked on 2026-11-25**, by reading each company's own pages and repositories. Nothing here is
from memory, and every price is quoted from the page linked beside it.

**This document is for the record.** The founder had already chosen Recall.ai before it was
written. It exists so that when the bill gets uncomfortable, or Recall changes its terms, the
alternatives do not have to be researched again from nothing.

---

## How a meeting bot actually works

There is no polite API inside Zoom or Google Meet that lets an outside program listen to a call.
So every company on this page does the same unglamorous thing: it runs **a real web browser inside
a container on a server**, points it at your meeting link, and lets it join the call as an ordinary
participant. It appears in the list of people with a name and usually a blank square. It hears what
the microphone of a participant would hear.

Three consequences follow, and they explain everything else below:

1. **It costs real money by the minute**, because a browser and a container are sitting there using
   a processor for as long as the meeting lasts.
2. **Everybody in the call can see it.** That is a feature, not a problem: it is what makes a
   notetaker honest. It is also why its name matters, and why Gyan's is "gyan Notetaker" plus the
   account owner's name.
3. **Self-hosting is not free.** You are not hosting an API, you are hosting a fleet of browsers.
   The only company that publishes real numbers says **1.5 to 4 processor cores and 3 to 8 GB of
   memory per bot in a call.**

---

## The short version

| | Recall.ai | Vexa | Attendee | MeetingBaaS |
|---|---|---|---|---|
| **Price per hour** | **$0.50** | **$0.30** (+$0.20 to transcribe) | **$0.50**, down to $0.35 | **from $0.35** |
| Free to start | first 5 hours | $2 of credit | first 5 hours | 75 bots/day plan is free |
| Zoom, Meet, Teams | all three | all three | all three | all three |
| Really open source? | **No** | **Yes**, Apache-2.0 | **No** — Elastic Licence 2.0 | **No** — Business Source Licence |
| Can you self-host it? | No | **Yes**, `docker compose` | Yes, but Kubernetes for real use | Yes, Kubernetes only |
| Gives you the audio file? | Yes | Yes (WAV) | Yes | Yes |
| How close is its API to Recall's? | — | **Moderately different** | **Nearly identical** | **Close** |

**Chosen: Recall.ai**, behind a provider layer, so that swapping to any of the other three means
writing one new file and changing one line.

---

## 1. Recall.ai — the one Gyan uses

Pricing page: <https://www.recall.ai/pricing> · Docs: <https://docs.recall.ai/>

| | |
|---|---|
| **Per hour** | **"$0.50/hr of recording"**, on the Pay As You Go plan. Billed by the second: "Recall.ai prorates billing to the second." |
| **Free trial** | "When you sign up on the Pay As You Go plan, your first 5 hours of recording are free." |
| **Minimum commitment** | None stated on the pricing page. |
| **Transcription** | **Optional, and Gyan does not buy it.** "Or, use our built-in transcription for $0.15/h." Gyan transcribes with Deepgram, which it already pays for, so no transcript is ever requested from Recall. |
| **Storage** | "7 days of free storage for every recording. Afterwards, $0.05 per hour of recording retained for 30 days." Gyan deletes its copy within seconds, so this should always be free. (Their storage docs quote a different figure, $0.000069 per hour-hour with 168 free hours. **The two pages disagree** — worth asking them which applies.) |
| **Surcharges** | 4-core Zoom bots cost "an additional $0.10/hr". GPU bots "an additional $1/hr". Gyan asks for neither. |
| **Worth asking for** | A startup programme: "an introductory rate of $0.25 per hour for their first 10,000 hours." That halves the bill. |
| **Open source** | No. A hosted service only. |
| **Where it runs** | Four separate deployments, chosen when you sign up and **not changeable afterwards**: `us-west-2`, `us-east-1`, `eu-central-1`, `ap-northeast-1`. Gyan is on **us-east-1 (US East)** — the founder's choice on 2026-11-25, matching the first market and where Supabase and Anthropic already hold data. |

**Why it was chosen first.** It is the only one of the four that is a finished product rather than a
project: all three platforms are production-supported, the webhook events are documented and
signed, the failure reasons are enumerated down to about thirty Zoom-specific codes, and it will
post a consent message into the meeting chat for you. For a feature whose whole risk is legal
rather than technical, buying the most boring option is the right call.

**What it is not.** It is the most expensive per hour except Attendee's list price, it cannot be
self-hosted at any price, and its security page would not load, so **its BAA, its sub-processors and
its certifications are all unchecked** (see `docs/security/vendors.md`).

---

## 2. Vexa — the only genuinely open-source one

Site: <https://vexa.ai/> · Pricing: <https://vexa.ai/pricing> · Code: <https://github.com/Vexa-ai/vexa>

| | |
|---|---|
| **Per hour** | **"$0.30/bot-hr"**, plus **"+$0.20/hr transcription · $0.50/hr all-in"**. So it is the cheapest if you transcribe elsewhere, as Gyan does — and Gyan does, so this is a genuine 40% saving on the bot itself. |
| **Free to start** | "$2 in free bot credit—no credit card required" — about 6 hours. |
| **Also offered** | "$12/seat/mo" for one concurrent bot and unlimited meetings. |
| **Open source** | **Yes, really: Apache-2.0**, confirmed on the repository itself. The only one of the four with an OSI licence. "Open core approved by FINOS." |
| **Self-host** | **Yes, and it is the easiest of the three.** `git clone`, `make all`, `make bot`. Needs Docker 26+ and, for production, Ubuntu 24.04. Building the bot image from source "wants 8 vCPUs and 16 GB RAM". |
| **Platforms** | Google Meet, Teams and Zoom all marked "Production". Jitsi built but not yet validated live. |
| **Audio** | Yes. Two steps: `GET /recordings/{id}/master?type=audio`, then fetch the `raw_url`. WAV chunks joined into one file. No per-speaker audio. |

**Maturity, honestly.** About 3,000 stars, 528 open issues, last commit three weeks before this was
written. Several parts carry the project's own "early" warning, and the README admits speaker
attribution "is not guaranteed", with roughly 4–7% of lines unattributed under heavy crosstalk —
which matters for Gyan, because speaker labels are a promise the product makes.

**Swap cost: moderate.** Three real differences. It takes **a platform and a meeting code, not a
URL**, so Gyan's link parser would have to hand it the pieces instead of the whole link. Its
webhook documentation page returns 404, so the event names could not be verified. And its own
status table says WebSocket streaming is "Planned (poll today)" while the pricing page advertises
it — a gap worth knowing about before relying on anything real-time.

---

## 3. Attendee — the closest API, the most restrictive licence

Site: <https://attendee.dev/> · Pricing: <https://attendee.dev/pricing.html> · Code: <https://github.com/attendee-labs/attendee>

| | |
|---|---|
| **Per hour** | **"Five hours free, then $0.50 per hour. Volume discounts available down to $0.35 per hour."** |
| **Open source** | **No, and this is the thing to understand.** It is the **Elastic Licence 2.0**, which is not an open-source licence. It says plainly: "You may not provide the software to third parties as a hosted or managed service." Running it for Gyan's own use is allowed. Reselling it is not. |
| **Self-host** | Yes for development (`docker compose`, about five minutes). For real use, their README is blunt: "The correct way to run Attendee in production is with Kubernetes, where each bot runs in its own isolated pod," and the default launcher is "not suitable for production". |
| **Platforms** | Zoom, Google Meet, Teams, and Webex in the docs. **Zoom needs your own Zoom Meeting SDK app**, and "Zoom bots must be approved by Zoom to join external meetings" — the same hurdle Recall has. |
| **Audio** | Yes. `GET /api/v1/bots/{id}/recording` "Returns a short-lived S3 URL for the recording of the bot". Audio-only is a configurable recording type. |

**Maturity.** 816 stars, 5,345 commits, last commit the same day this was written. Actively built,
no early-stage warning.

**Swap cost: low — the lowest of the three.** Its shape is the same shape Gyan's provider interface
already describes: create a bot with a `meeting_url` and a `bot_name`, receive `bot.state_change`
webhooks signed in a header, then fetch a recording URL. It even supports **per-bot webhook URLs**,
which Recall does not. If Recall ever has to go, this is the first place to look.

---

## 4. MeetingBaaS — the one that tells you what self-hosting costs

Site: <https://meetingbaas.com/> · Pricing: <https://meetingbaas.com/en/pricing> · Licence: <https://meetingbaas.com/en/legal/license>

| | |
|---|---|
| **Per hour** | **"From $0.35 per recording hour."** Sold as tokens: one token records one hour with speaker labels included. $50 for 100 tokens ($0.50 each) up to $1,500 for 4,250 tokens ($0.35 each). Transcription adds 0.25 of a token, or 0.05 with your own key. |
| **Watch out** | "Raw recording tokens are charged **even when a bot has not been accepted in a meeting**." Recall does not charge for a bot nobody admitted. |
| **Plans on top** | Pay as you go is free (75 bots/day), then $99, $199, $299 a month for higher daily bot counts. |
| **Open source** | **No.** Business Source Licence 1.1 on the core bot and server, becoming Apache-2.0 eighteen months after each release. Internal use by an organisation with "more than 100 employees or over $5M annual revenue requires a paid commercial license". |
| **Self-host** | Kubernetes with Helm charts. Needs Kubernetes 1.24+, two node pools, PostgreSQL 14+, S3-compatible storage, an SQS-compatible queue, Redis, and a virtual video device plugin in the bot pods. |

**The numbers everybody else leaves out.** This is the only project that publishes what a bot
actually consumes: **"CPU: 1.5-4 cores per bot pod"** and **"Memory: 3-8GB per bot pod"**, on nodes
of "16+ CPU, 32GB+ RAM". That works out at roughly **4 to 10 bots in a call at once per 16-core
machine.**

**Swap cost: low to moderate.** Account-level webhooks through Svix, like Recall, with a
`bot.completed` event carrying a presigned audio URL — but that URL is "valid for 4 hours", so the
download has to be prompt. Its token pricing would also have to be converted into a per-hour rate
for Gyan's cost logging.

---

## What this means for self-hosting, in plain words

The temptation is obvious: Vexa is Apache-2.0 and free to run, so why pay $0.50 an hour?

Because **you would not be saving the $0.50, you would be swapping it for a server bill and your
own time.** MeetingBaaS's published figures are the honest guide: 1.5 to 4 cores per bot in a call.
A machine that can hold four simultaneous bots is a 16-core box, which is roughly $150 to $250 a
month on any cloud, running whether anybody is in a meeting or not. Recall charges nothing when
nobody is recording.

The crossover, worked out from those numbers: **below roughly 300 bot-hours a month, paying per
hour is cheaper and very much less work.** 300 hours is about ten one-hour meetings a day, every
working day. Gyan is nowhere near that, and the Free plan gets zero bot hours.

So the rule written into `docs/decisions.md` is: **revisit self-hosting only when the bot bill
passes about $50 a month, and only on a server with more than 2 processor cores** — because below
that it cannot run even one bot reliably.

---

## What needs setting up, per platform

| | Works from just a link? |
|---|---|
| **Google Meet** | **Yes.** Somebody has to let the bot in from the waiting room, and it has to be somebody signed in to the host's Google Workspace — Recall says "Any signed in participant in the host's Google Workspace can let the bot in", so not only the host. If the host has turned knocking off entirely, the bot cannot even ask. |
| **Microsoft Teams** | **Usually.** The organiser's meeting-access settings can block outside participants, which blocks the bot. Teams enforces its own 30-minute waiting-room limit. A channel meeting cannot receive the consent chat message. |
| **Zoom** | **No.** Recall needs Zoom SDK credentials configured in their dashboard, and their own error text says: "Bots using unapproved Zoom credentials can only join meetings hosted in the workspace of the user that created the credentials." **So Zoom needs a Zoom Marketplace app submitted and approved by Zoom** before it works for any customer. This is true of Attendee too. It is the single biggest piece of unavoidable paperwork in this feature. |

---

## The choices the founder had to make, and the answers

| Choice | Decided | Why |
|---|---|---|
| Which provider first | **Recall.ai** | Already decided before this document. The most finished of the four. |
| Which region | **US East** (`us-east-1`) | First market is the United States; Supabase and Anthropic already hold data there. **Not changeable later without a new Recall account.** |
| How long Recall keeps a recording | **24 hours** | Gyan downloads it and deletes Recall's copy within seconds. 24 hours is the backstop if that delete ever fails, and leaves a day to recover by hand. |
| Who may send a bot | **Nobody, until the switch is turned on per account by hand** | The consent wording has not been through a lawyer. |
| Free plan bot hours | **0** | A bot costs real money per minute and the free plan has to have a floor. |

## When to read this again

- If the bot bill passes about $50 in a month.
- Before signing anything with a customer who asks where their recordings are stored.
- If Recall changes its prices, its regions or its terms.
- Otherwise every six months. Three of the four pricing pages carry no date, and all of them change.
