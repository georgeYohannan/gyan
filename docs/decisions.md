# Decisions

- 2026-11-16: Gyan is dark navy only. There is no light mode in version 1. Colors, fonts, and motion live in src/constants/theme.ts and are repeated in tailwind.config.js (a test keeps them in sync).
- 2026-11-16: Quiet body text color is #94A3B8. It is not in CLAUDE.md. It was chosen because it keeps 4.5:1 contrast on the navy background.
- 2026-11-16: The Supabase project with ref ofnspnobzesxmyqjxzad is the TEST project. Do not use it as live. Only the public key goes in the app (in .env.local), never the service_role key.
- 2026-11-16: Added status text colors that are not in CLAUDE.md: green #86EFAC (Ready) and soft red #FCA5A5 (Failed and errors). Both pass 4.5:1 on navy. White text on the orange record button (#C2410C) also passes 4.5:1. Brand blue is still never used as text.
- 2026-11-16: The help panel is a side panel on web windows 768 points wide or more, and slides up from the bottom on phones and narrow windows. All help words live in src/content/help.ts.
- 2026-11-16: /design is a builders-only page. On web it has a route but no tab button. On phones (native tabs) it may show as an extra tab for now; we hide it before launch.
