# gyan

## What this project is
Gyan is an AI note-taker app made by GyanTech AI. Users record in person, upload audio, video, or text, or send a bot to Zoom, Google Meet, and Teams. Gyan makes a transcript with speakers, a summary, action items, and a mind map. A side chat answers questions about notes. Users pick a preferred language and can translate any transcript, summary, or chat answer.
One Expo codebase makes the web app, iOS app, and Android app. The web app lives on a gyantechai.com subdomain. The first market is the United States.

## The person you are working with
A non-technical founder who has never built a mobile app. Explain what you are doing in plain, short sentences. Explain tech terms the first time you use them. Ask before you delete anything.

## Read these first
- docs/product-spec.md: what each screen and feature does
- docs/data-model.md: database tables and the AI prompts
- docs/progress.md: what is done and what is next
- docs/decisions.md: decisions already made

## Stack
- App: Expo (React Native) with Expo Router, NativeWind, Reanimated
- Backend: Supabase (Postgres, login, storage, server functions, pgvector)
- Speech to text: Deepgram Nova-3
- Meeting bot: Recall.ai
- AI: Claude API for summaries, action items, mind map data, side chat, and translation
- Payments: RevenueCat with Stripe
- Email: Resend or a similar email API
- Builds: EAS Build and EAS Submit

## Commands
- Start the app: npx expo start
- Start the web version: npx expo start --web
- Build for stores: eas build
- Submit to stores: eas submit
- Run tests: FILL IN after Phase 1
- Format and type check: FILL IN after Phase 1

## Folder map
FILL IN after Phase 1. List the main folders and what each one holds.

## Hard rules
1. Secret keys live only in Supabase server functions or in env files that are never committed. Never put a key in app code.
2. Row Level Security is on for every table. A user can only read their own notes and their team's notes.
3. Plan limits, seat counts, and prices come from the plans table. Never hard code them. The free plan starts at 5 meetings per month, and an admin can change it.
4. Use the Supabase test project, never the live one, until the founder says it is launch time.
5. Never guess package names, versions, or API details. Read the current docs first, using the Expo MCP server and the vendor docs.
6. Every new feature gets a test. Run it before you say the work is done.
7. Translated text is always labeled "Translated by AI" and has a "Show original" toggle.
8. Never record or join a meeting without a clear consent notice for the people in it.

## Design
- Dark navy theme. Use the design tokens in the code, not loose color values.
- Background #0B1220. Panels #0F172A. Glass is white at 6% to 14% opacity with a 14% white border.
- Brand blue #0066FF for glows, buttons, and borders. Never use it as body text on navy. Use #99CBFF for blue text and links.
- Headings #FFFFFF in Schibsted Grotesk Bold. Body text #E2E8F0 in IBM Plex Sans.
- Record button and highlights #C2410C, as a fill only.
- Pill buttons (999px radius). UI transitions 0.2 seconds. Reveals 0.32 seconds. Easing cubic-bezier(.16, 1, .3, 1).
- Body text needs at least 4.5:1 contrast. Respect the reduce motion setting. Phone touch targets are at least 44 by 44 points.
- For any screen or visual work, use the frontend-design skill and check the result with a screenshot.

## How to work
1. Start in plan mode. Show the plan and wait for approval.
2. Build 1 small feature at a time.
3. Check your work: run the tests, and for screens, look at web and phone sizes.
4. Commit to GitHub with a clear message.
5. Add 1 line to docs/progress.md.
6. Tell the founder what to check, in plain words.

## Do not
- Do not add features that are not in docs/product-spec.md. Ask first.
- Do not run commands that delete data without a warning and a backup step.
- Do not paste real keys into chat or into files that get committed.
- Do not use the live Supabase project for tests.

---

# Expo rules (from the Expo starter)

@AGENTS.md
