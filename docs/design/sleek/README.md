# Sleek design drafts

Four screens that have no code yet, drawn by [Sleek](https://sleek.design) on 2026-11-18 so we
can see them before building them: **Search**, **Settings**, **Plan and billing**, and **Team**.

Live project (you can open, edit and re-run it): https://sleek.design/project/tWmySNLIkTd

| Picture | Screen |
| --- | --- |
| `00-all-four.png` | All four side by side |
| `01-search.png` | Search |
| `02-settings.png` | Settings |
| `03-plan-and-billing.png` | Plan and billing |
| `04-team.png` | Team |

## What these are, and what they are not

These are **pictures to copy from, not code to paste.** Sleek draws web pages (HTML); Gyan is a
phone app. Each screen gets rebuilt by hand with the pieces already in `src/components/ui`, so the
real screens stay in one family with the twelve screens already built.

Three things in the pictures are made up and must not be copied into the app:

1. **The numbers.** "7 of 10 meetings" and "$12 per month" are stand-ins. The real limits and
   prices come from the `plans` table, never from code. The Free plan is 5 meetings a month today.
2. **The people.** Names, emails and note titles are invented examples.
3. **The bottom tabs.** The pictures show Search / Notes / Settings. The app's real tabs are
   decided in `src/components/app-tabs.tsx`, and adding a Search tab is a separate decision.

## Two details I added that were not written down anywhere

Sleek needs a visual opinion to work from, so the brief pinned two things beyond the rules in
CLAUDE.md: a soft blue glow under the single main button on a screen, and speaker names set small
and uppercase so a transcript reads like a script. Both already match the app. Say so if either
should go.

The full brief that produced these is saved below, so the same look can be reproduced or extended.
