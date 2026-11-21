# HIPAA checklist: what is code, and what is paperwork

**Last updated 2026-11-21.**

Gyan is **built to support HIPAA and GDPR requirements, pending legal review.**

**It is not HIPAA compliant, and this document does not say it is.** Compliance is a legal
judgement about contracts, training, policies and people — most of it is not code at all, and
none of it is something software can claim about itself. What this page does is separate the
part that is built from the part that is yours, so neither hides behind the other.

As of today the decision is: **build the baseline now, do not sell to healthcare customers
yet.** No BAA is signed with any vendor. Everything in the paperwork column is therefore open,
and that is on purpose rather than by neglect.

---

## Part 1: the code. This is mine, and it is done unless it says otherwise

These are the technical safeguards HIPAA's Security Rule asks for, in plain words.

| # | What is needed | Status | Where it is |
|---|---|---|---|
| 1 | **Only the right people can reach data** | **Done** | Every table has Row Level Security. A person reads only their own account's rows. 36 checks run against the real test project. |
| 2 | **Everyone has their own login** | **Done** | Email and password per person, no shared accounts. Email confirmation on. |
| 3 | **A record of who did what** | **Done** | `audit_log`: sign in, opening, exporting, sharing and deleting a note, settings and team changes. Cannot be edited or deleted by anybody, including the server key. Owner reads it under Settings → Security. |
| 4 | **Sessions end by themselves** | **Done** | Signs out after 30 minutes of doing nothing. The time is a per-account setting. |
| 5 | **Data is encrypted in transit** | **Done** | Everything over HTTPS. Email over port 465, encrypted from the first byte. |
| 6 | **Data is encrypted at rest** | **Done, by Supabase** | Supabase encrypts storage and database. Not something Gyan does itself. |
| 7 | **A second factor for sign in** | **Done, optional** | Authenticator app, per person. **See the honest limit below.** |
| 8 | **Passwords are not trivial** | **Partly — needs you** | Gyan asks for 12 characters. The real rule is in the Supabase dashboard and only you can set it. See the hand-over list. |
| 9 | **Data can be got out** | **Done** | Settings → Data and privacy → Download a copy of everything. |
| 10 | **Data can be destroyed** | **Done** | Deleting a note, deleting an account, and automatic deletion after 30, 90 or 365 days. What stays is listed on screen with the reason. |
| 11 | **Keep only as long as needed** | **Done** | Per-account retention setting. |
| 12 | **Nothing sensitive in logs** | **Done** | Every server log line records the kind of error only. A test watches the whole server for a line that breaks this. |
| 13 | **Hostile input cannot take over the AI** | **Done, with limits** | Transcripts are fenced and marked as data, never instructions. The model has **no tools**, so the worst case is a wrong summary. 19 tests. |
| 14 | **Files are checked, not trusted** | **Done** | The server reads the first bytes and works out what a file really is. |
| 15 | **Limits on anything that costs money** | **Done** | Per person and per account, from one settings table. |
| 16 | **The web pages are hardened** | **Done, with limits** | Content policy, no framing, no sniffing, referrer and permissions policies, HSTS. Inline styles and scripts are allowed because React Native for web needs them. |
| 17 | **Consent is recorded** | **Done** | Which wording, by whom, and when. In the database, not just on the device. |
| 18 | **Secrets never reach the app** | **Done** | Keys live only in server secrets. Checked before every commit and by tests. |
| 19 | **Recovery codes for the second factor** | **NOT DONE** | See below. The reason it is not done matters. |
| 20 | **Automatic deletion runs on a schedule** | **NOT DONE** | Retention works, but somebody has to run it. Scheduling it is a decision for you, because it deletes real work. |
| 21 | **Asking for the old password before changing it** | **NOT DONE** | Being signed in is currently enough. Supabase supports asking; it is small and is listed for a later round. |
| 22 | **Someone is told when something looks wrong** | **NOT DONE** | Nothing watches the audit log or alerts on a burst of failures. HIPAA expects this. |

### The honest limit on the second factor

Two-factor sign in is a lock on the **app**, not on the **data** behind it. Somebody holding a
stolen session token could still reach the server without ever seeing the code screen.

Supabase *can* require the code in the database rules, which would be genuinely stronger. It is
deliberately not switched on because **Gyan has no way to let somebody back in if they lose
their phone.** Locking a customer out of their own meeting recordings for ever is a worse
failure than the one it fixes. Supabase has recovery codes, but the library marks that part
experimental.

**Recovery codes first, then the stricter rule.** That is item 19, and it should be done before
any healthcare customer is signed.

---

## Part 2: the paperwork. This is yours, and none of it is started

**No amount of code finishes this part.** A perfectly built app with none of this done is not
compliant, and would not survive a customer's security review.

| # | What is needed | Status | What it means |
|---|---|---|---|
| 1 | **BAA with Supabase** | Not signed | They offer one on Team or Enterprise. Gyan is on the free plan, so this costs money before it is possible. |
| 2 | **BAA with Anthropic** | Not signed | They offer one for the API. The account owner signs, then asks them to switch it on. |
| 3 | **BAA with Deepgram** | **Unknown whether possible** | Nothing on their public pages mentions one. You would have to ask. If they will not, Deepgram cannot be used for healthcare work at all. |
| 4 | **BAA with Hostinger** | **Appears not possible** | Nothing on their pages. If so, recap emails must carry **a link only** for any healthcare account — which the privacy setting already does. |
| 5 | **A privacy policy** | Not written | Must say what is collected, who sees it, how long it is kept, and how to get it out or delete it. |
| 6 | **Terms of service** | Not written | |
| 7 | **The consent wording reviewed** | Not done | Already flagged in the product spec. The words are in `src/lib/consent.ts` and are recorded per person with their version. |
| 8 | **A written security policy** | Not written | HIPAA asks for this on paper, not just in practice. |
| 9 | **A breach plan a lawyer has read** | **Draft only** | `docs/security/incident-plan.md` is a draft, marked as one. |
| 10 | **A named person responsible** | Not done | HIPAA expects a named security official. For now that is you. |
| 11 | **Staff training, written down** | Not done | Applies when somebody else works on Gyan. |
| 12 | **A risk assessment, written down** | **Partly** | `docs/security/audit-1.md` is most of a technical one. It is not a formal risk assessment. |
| 13 | **Agreements with anybody who helps** | Not done | Contractors with access count. |
| 14 | **Checking vendors again, regularly** | Not started | `docs/security/vendors.md` says when. |
| 15 | **Your own Supabase account secured** | **Please do this now** | Two-factor on your Supabase login. The strongest database rules do not help if somebody opens the dashboard. It is in the hand-over list. |

---

## What would have to be true before selling to a healthcare customer

Not a plan, just the honest list:

1. Supabase on a paid plan, with a BAA signed.
2. A BAA with Anthropic.
3. **An answer from Deepgram about a BAA.** If no, the transcription step has to change, and
   that is a big change.
4. Recap emails set to **link only** for those accounts, because Hostinger has no BAA.
5. Recovery codes, then two-factor required in the database rules.
6. Items 20, 21 and 22 from Part 1.
7. Everything in Part 2 that is a document, written and reviewed.
8. A lawyer's sign-off that the whole thing hangs together.

**That is a long list, and today none of it is done.** That is the right state for a product
that has decided not to sell to healthcare yet. The point of doing the code now is that none
of it has to be retrofitted later, which is the expensive way.
