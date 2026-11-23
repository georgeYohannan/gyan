# What to do if data gets out

> **THIS IS A DRAFT, FOR A LAWYER TO REVIEW.**
>
> It was written by Claude Code, not by a lawyer. The steps are sensible and the order is
> right, but **the deadlines and the duty to tell people are legal questions that change by
> country, by US state, and by whether health information is involved.** Do not rely on the
> timings here without checking them.
>
> Nothing in it is HIPAA compliance. Gyan is **built to support HIPAA and GDPR requirements,
> pending legal review.**

**Last updated 2026-11-21. Owner: George Yohannan.**

---

## First, what counts as an incident

Any of these. When unsure, treat it as one — the cost of over-reacting is a wasted afternoon.

- Somebody could see notes, recordings or transcripts that were not theirs.
- A key leaked: a Supabase key, the Claude or Deepgram key, the mailbox password.
- A laptop or phone with the Supabase dashboard signed in was lost or stolen.
- A vendor tells you they had a breach.
- Somebody tells you they saw data they should not have.
- A recap email went to the wrong person.
- Anything that looks like someone getting in: a burst of failed sign-ins, strange entries
  in the audit log, a bill that makes no sense.

**A bill that makes no sense belongs on that list.** Gyan's limits are also a cost alarm: a
sudden jump usually means somebody is using it in a way you did not expect.

---

## Hour one: stop it getting worse

Do these in order. **Do not start writing anything to customers yet.**

1. **Write down the time** you found out, and how. Everything later hangs off this.
2. **Stop the bleeding.**
   - A leaked key → make a new one in the vendor's dashboard and put it in Supabase secrets.
     The old one stops working at once.
   - Somebody else's account → in the Supabase dashboard, Authentication → sign their
     sessions out.
   - A lost laptop → change your Supabase password and sign out every session.
3. **Do not delete anything.** Not logs, not rows, not emails. You will need them, and
   deleting them looks far worse later than whatever happened.
4. **Take a copy of the evidence**: the audit log (Settings → Security), Supabase function
   logs, and `email_log`.
5. **Tell one other person.** Not for approval — so there is a second pair of eyes and a
   witness to what was decided.

---

## Day one: work out what actually happened

Answer these in writing, even if some answers are "we do not know yet".

| Question | Where to look |
|---|---|
| **What got out?** Notes, recordings, transcripts, email addresses, passwords? | `audit_log`, Supabase logs |
| **Whose?** How many people, and which accounts? | `audit_log`, `account_members` |
| **When did it start, and has it stopped?** | Timestamps everywhere |
| **How did they get in?** | Supabase logs, function logs |
| **Was it read, or only reachable?** | `audit_log` records opening a note |
| **Was health information involved?** | This changes the legal answer completely |

**Passwords are the one thing you can be calm about.** Supabase stores them hashed with
bcrypt; they are not readable, even by you. Say so plainly — it is the question people ask
first.

---

## Then: who has to be told, and when

**These timings need a lawyer to confirm.** They are the common ones, not advice.

| Who | Usually by when | Notes |
|---|---|---|
| **The people affected** | Varies. GDPR says "without undue delay" where there is a real risk | US state laws differ, and the first market is the US |
| **A data protection authority** (GDPR) | Commonly 72 hours from becoming aware | Only if EU/UK people are affected |
| **US state regulators** | Varies by state | |
| **Health regulators** (HIPAA) | Different rules again, with thresholds on numbers | Only if health information is involved |
| **Business customers** | Whatever their contract says | Check before promising anything |
| **The vendor** | As soon as it looks like their problem | |

**Tell people even when you are not sure you must.** Finding out later from somebody else is
far worse than being told early by you.

### What a message to a customer says

Short, plain, and no hedging:

1. What happened, in one sentence.
2. What of theirs was involved — and what was not.
3. When it happened, and when you found out.
4. What you have done already.
5. What they should do, if anything.
6. How to reach a real person.

**Never say "no data was accessed" unless you can prove it.** "We are still checking, and we
will tell you by Friday" is a better sentence than one you have to take back.

---

## Afterwards

1. **Write down what happened and why**, while it is fresh. Not to blame anybody — so the
   same hole cannot open twice.
2. **Fix the cause**, and add a test that fails if it comes back. Every real fix in this
   project has one.
3. **Update `docs/security/audit-1.md`** with what was found.
4. **Tell the people you told before** what you ended up doing.

---

## Things to have ready before you need them

- [ ] A lawyer who answers the phone, and knows US breach notification law.
- [ ] Vendor support contacts: Supabase, Deepgram, Anthropic, Hostinger.
- [ ] Insurance details, if there is any.
- [ ] Somewhere to write this up that is **not** inside Gyan.

## Things that would make an incident much easier

Honest gaps, from `docs/security/hipaa-checklist.md`:

- **Nothing watches anything.** No alert on a burst of failed sign-ins, a spike in cost, or
  somebody opening an unusual number of notes. You would find out from a customer or a bill.
- **No practice.** A plan nobody has walked through is a document, not a plan. Half an hour
  pretending a key leaked would find the gaps in this one.
