# Decisions

- 2026-11-16: Gyan is dark navy only. There is no light mode in version 1. Colors, fonts, and motion live in src/constants/theme.ts and are repeated in tailwind.config.js (a test keeps them in sync).
- 2026-11-16: Quiet body text color is #94A3B8. It is not in CLAUDE.md. It was chosen because it keeps 4.5:1 contrast on the navy background.
- 2026-11-16: The Supabase project with ref ofnspnobzesxmyqjxzad is the TEST project. Do not use it as live. Only the public key goes in the app (in .env.local), never the service_role key.
- 2026-11-16: Added status text colors that are not in CLAUDE.md: green #86EFAC (Ready) and soft red #FCA5A5 (Failed and errors). Both pass 4.5:1 on navy. White text on the orange record button (#C2410C) also passes 4.5:1. Brand blue is still never used as text.
- 2026-11-16: The help panel is a side panel on web windows 768 points wide or more, and slides up from the bottom on phones and narrow windows. All help words live in src/content/help.ts.
- 2026-11-16: /design is a builders-only page. On web it has a route but no tab button. On phones it is a "Design" tab that only appears in development builds (__DEV__), never in store builds.
- 2026-11-16: Google sign in is NOT in this step. Version 1 starts with email and password. Google needs a Google Cloud project and separate keys for web, iPhone, and Android, so it comes in its own later step. The product spec still lists it for version 1.
- 2026-11-16: The chunks table (search pieces of transcript) is not created yet. It needs a vector size, which depends on the embedding model, and that is still an open decision.
- 2026-11-16: The private file storage bucket and its rules are not created yet. No file upload exists yet. They come with the Upload feature.
- 2026-11-16: Row Level Security: the app can read only; server functions write. Members can read invites. Only owners read integrations (they may hold tokens). The app can change only display_name and preferred_language on a profile, so is_admin can never be changed from the app.
- 2026-11-16: Sign up trigger (public.handle_new_user) makes the profile, a Free-plan account, and the owner row in one step, and looks the plan up by name from the plans table. Passwords need at least 8 characters.
- 2026-11-16: The first-sign-in consent note is remembered per person on that device (not in the database). The wording needs a lawyer's review before public launch.
