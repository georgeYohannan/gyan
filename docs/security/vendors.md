# Who else sees your customers' data

**Checked on 2026-11-21**, by reading each company's own pages. Nothing here is from memory.

Gyan is **built to support HIPAA and GDPR requirements, pending legal review.** That is not
the same as being HIPAA compliant or GDPR compliant, and nobody should write that anywhere
until a lawyer has said so in writing.

## How to read this

Every line is marked one of three ways, and the difference matters more than the content:

- **Verified** — I read it on the company's own page and have quoted it.
- **Not found** — I read the page where it should be, and it is not there.
- **Could not check** — the page would not load, or there is no public page.

A gap you know about is safer than a claim you cannot back up. **Nothing here should go into
a customer answer or a security questionnaire without you checking the link yourself**, because
these pages change.

## The short version

| Vendor | What it sees | BAA for HIPAA? | Trains on your data? |
|---|---|---|---|
| **Supabase** | Everything: notes, transcripts, summaries, recordings, logins | **Yes**, on Team or Enterprise | No |
| **Deepgram** | Every recording, and the transcript it makes | **Not found** | **Yes, by default.** Now switched off — see below |
| **Anthropic** | Transcripts, and the summaries and answers it writes | **Yes**, for the API | **No**, not by default |
| **Hostinger** | Recap and invite emails, including the summary unless switched off | **Not found** | n/a |
| **Resend** | Nothing any more. Left here because its DNS records still exist | n/a | n/a |
| **Recall.ai** | Nothing yet. Not built, switch off | **Could not check** | Could not check |

**Signed status is left blank on purpose.** That column is yours to fill in.

---

## 1. Supabase — the database, the logins, and the files

**What it sees:** everything. Notes, transcripts, summaries, to-dos, chats, recordings,
uploaded files, email addresses, and every password (stored hashed, never readable).

| | |
|---|---|
| **BAA for HIPAA** | **Verified.** "Supabase is HIPAA compliant. You can store Protected Health Information (PHI) on our hosted platform once you enter into a Business Associate Agreement (BAA) with us." Enterprise and Team customers can request to sign it on the dashboard. (supabase.com/security) |
| **GDPR agreement** | **Verified** that one exists, at supabase.com/legal/dpa, version 1 dated 1 August 2026, with Supabase Pte. Ltd. Accepting the terms counts as signing the standard clauses. **Not found:** whether it is click-through or on request. |
| **Where data sits** | **Verified.** "Supabase offers regions across the US, EU, and Asia Pacific", and "Projects hosted in EU regions keep your primary database data in-region." You choose when you create a project. |
| **Retention you control** | **Verified** in the agreement: kept "for the duration of the Agreement, unless earlier deletion is requested by the Customer", and deleted after a 30-day window once it ends. **Not found:** how long backups are kept. |
| **Sub-processors** | **Verified** that a list exists at supabase.com/legal/customer-resources/subprocessor-list, as PDFs. Subscribers get 30 days' notice of changes. I did not open the PDFs. |
| **Agreement needed** | A BAA **only if you sell to healthcare.** The data agreement, yes, either way. |
| **Signed** | |

**Worth knowing:** Gyan is on the free plan. The BAA needs Team or Enterprise, so going after a
healthcare customer means paying for Supabase first.

---

## 2. Deepgram — turning recordings into words

**What it sees:** **every recording anybody uploads**, and the transcript it makes from it.
This is the most sensitive relationship Gyan has, because audio is the raw thing.

| | |
|---|---|
| **BAA for HIPAA** | **Not found.** Their security page (deepgram.com/security) returns an error, and neither their privacy policy nor their data-security page mentions HIPAA or a BAA. **This does not mean they do not offer one** — it means it is not public, and you would have to ask. |
| **GDPR agreement** | **Verified** that one exists: "We enter into data processing agreements with our customers", including the standard clauses for sending data to the US. It can be requested from security@deepgram.com. |
| **Where data sits** | **Verified** only as far as "including to our servers in the United States and other jurisdictions". **Not found:** any way to choose a region on an ordinary plan. |
| **Retention you control** | **Not found.** Their policy says data is kept "for the length of time needed to fulfill our business purposes" and gives no number. |
| **Trains on your data** | **VERIFIED, AND THIS WAS A REAL PROBLEM.** See below. |
| **Sub-processors** | **Verified**: about 50 companies at deepgram.com/privacy/subprocessors. Two are other AI companies that can see audio or text: **Anthropic and OpenAI.** |
| **Agreement needed** | A data agreement, yes. A BAA if you sell to healthcare — and you would have to ask whether they do one at all. |
| **Signed** | |

### The thing that was wrong, and is now fixed

Deepgram's own documentation says requests **"participate in the Model Improvement Program
(MIP) by default, and Deepgram retains them"** — the audio *and* the transcript.

Gyan set no opt-out. **So every recording uploaded before 21 November 2026 was kept by
Deepgram and may have been used to improve their models.**

Fixed the same day: every transcription request now carries `mip_opt_out=true`, which
Deepgram says means data is "Retained only for the duration needed to process the request."

**Two things still for you:**

1. **This changes nothing about recordings already sent.** Only Deepgram can say what they
   still hold. If any real meetings went through, it is worth asking them.
2. **Ask them to switch opt-out on for the whole account.** Their own docs suggest this
   instead of relying on a flag per request, and their pages do not say whether the flag
   works on every plan. You can confirm it is working in their console under **Usage → Logs**,
   where `mip_opt_out` shows as `true`.

**Deepgram is the weakest link in this list**: no public BAA, trains by default, no region
choice I could verify, and no stated retention period.

---

## 3. Anthropic — writing the summaries, answers and translations

**What it sees:** the transcript of a note (or the text somebody pasted) when a summary,
chat answer or translation is made. Not the audio.

| | |
|---|---|
| **BAA for HIPAA** | **Verified.** "Anthropic provides a BAA covering our HIPAA-ready services, such as use of our first-party API". The account owner signs it, then asks them to switch it on. Some features are **not** covered, including the Batch and Files APIs — Gyan uses neither. |
| **GDPR agreement** | **Verified**, and automatic: the data addendum "is incorporated into these Terms by reference", and the standard clauses "will be deemed to have been executed by the parties". Nothing to sign separately. |
| **Where data sits** | **Verified**: traffic may go to the US, Europe, Asia and Australia, and **"data is stored in the US."** |
| **Retention you control** | **Verified**: "we automatically delete inputs and outputs on our backend within 30 days". Flagged content can be kept up to 2 years. Zero retention is possible but needs their approval. |
| **Trains on your data** | **Verified, and the answer is no.** The terms say "Anthropic may not train models on Customer Content", and their policy says "By default, we will not use your inputs or outputs from our commercial products... to train our models." |
| **Sub-processors** | **Could not check.** Their trust centre pages returned nothing when read. |
| **Agreement needed** | A BAA **only if you sell to healthcare.** The data agreement is already in place by accepting the terms. |
| **Signed** | |

---

## 4. Hostinger — sending gyan's email

**What it sees:** every recap and invite email. **A recap carries the summary of a meeting**,
unless the account has switched that off under Settings → Data and privacy.

| | |
|---|---|
| **BAA for HIPAA** | **Not found.** Neither their privacy policy nor their data agreement mentions HIPAA or a BAA. |
| **GDPR agreement** | **Verified**, and automatic: accepting their terms "is deemed to have signed these EU Standard Contractual Clauses". Email is explicitly a covered service. |
| **Where data sits** | **Partly verified**: the UK, the Netherlands, Lithuania or Cyprus, with some servers outside the EU. **Not found:** where mailbox contents specifically sit. |
| **Retention you control** | **Verified** for deletion after you leave: "thirty (30) days following Termination Date". **Not found:** a mailbox retention setting. |
| **Sub-processors** | **Verified**, listed in their agreement: AWS, Google Cloud, Cloudflare, MailChannels, Proofpoint, Anthropic Ireland, and others. |
| **Agreement needed** | A data agreement, already accepted. A BAA is **not available as far as their pages say.** |
| **Signed** | |

**Worth knowing:** if you ever sell to healthcare, **the privacy setting that keeps summaries
out of email matters more than anything else on this page** — it is the difference between an
email provider with no BAA seeing a meeting's contents and seeing only a link.

---

## 5. Resend — no longer used

Gyan used Resend to send email until 19 November 2026, then moved to the Hostinger mailbox.

**It sees nothing now.** It is listed because **the DNS records for it still exist** on
`send.gyantechai.com` and `resend._domainkey.gyantechai.com`. They are harmless and were left
alone deliberately rather than deleted without asking. If Resend is never coming back, removing
them is tidier — one fewer thing able to send email that looks like it came from you.

---

## 6. Recall.ai — not in use

The meeting bot is **not built**, and its switch stays off until a lawyer has reviewed the
consent wording.

**Could not check anything.** Their security page returns an error. Before this is ever
switched on, their BAA, retention and sub-processors all need checking — and this vendor would
see **more** than any other: it sits inside a live meeting with everybody in it.

---

## What I could not check at all

Being straight about the edges:

- **Deepgram:** whether a BAA exists; any retention period; any choice of region.
- **Anthropic:** their sub-processor list and security certifications — their trust centre
  returned nothing. Also whether a Team plan is covered by a BAA, as opposed to the API.
- **Supabase:** how the data agreement is signed; how long backups are kept.
- **Hostinger:** where mailbox contents sit specifically.
- **Recall.ai:** everything.

## When to check this again

- Before signing anything with a healthcare customer.
- Before switching the meeting bot on.
- If a vendor is added, removed, or changes plan.
- Otherwise every six months. These pages change, and nothing here warns you when they do.
