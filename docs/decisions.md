# Decisions

- 2026-11-16: Gyan is dark navy only. There is no light mode in version 1. Colors, fonts, and motion live in src/constants/theme.ts and are repeated in tailwind.config.js (a test keeps them in sync).
- 2026-11-16: Quiet body text color is #94A3B8. It is not in CLAUDE.md. It was chosen because it keeps 4.5:1 contrast on the navy background.
- 2026-11-16: The Supabase project with ref ofnspnobzesxmyqjxzad is the TEST project. Do not use it as live. Only the public key goes in the app (in .env.local), never the service_role key.
