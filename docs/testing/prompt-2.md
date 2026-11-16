# How to test the design system (prompt 2)

You need no new accounts or keys. You only need the terminal.

1. Open a terminal in the gyan folder.
2. Run `npm run check`. It should end with "Tests: 53 passed" and no red errors.
3. Run `npx expo start --web`. Wait until it says the web app is ready, then open http://localhost:8081/design in Chrome. The first load can take about 10 seconds.
4. Look at the page. The background should be dark navy. Panels should look like see-through glass with a thin light border.
5. Check the fonts. "Design" and the panel titles should be a bold, modern heading font (Schibsted Grotesk). Normal text should be a clean, friendly font (IBM Plex Sans). Neither should look like plain Times or Arial.
6. Find the first blue "Primary" button under Buttons. It should glow. It should be the ONLY glowing thing on the page.
7. Check the buttons: blue Primary, dark glass Secondary, orange Record. All are pill shaped (fully rounded ends).
8. Scroll down. Check each group shows: Default, Pressed (slightly smaller and darker), Disabled (faded, cannot click), Loading (a small spinner), and Error (red message).
9. Click in the "Default" text box and type. A blue border should appear. The "Error" box should have a red border and a red message.
10. Check the six status badges: Uploading, Queued, Transcribing, Summarizing, Ready, Failed. Ready is green. Failed is red. Each shows a word, not only a color.
11. Look at the gray bars at the bottom. They should gently fade in and out.
12. Click the round "?" at the top right. On a wide window, a panel should slide in from the right. It should say "For builders only", show a title, 3 short sentences, and 2 screenshots.
13. Close the panel three ways: the Close button, the Escape key, and a click on the dark area outside. Try each one.
14. Make the browser window narrow (drag the edge until it is about phone width, 390 pixels). Open "?" again. The panel should now slide up from the bottom.
15. Reduce motion check (Mac): System Settings > Accessibility > Display > turn on "Reduce motion". Reload the page. The gray bars should stop fading, and the panel should appear without sliding. Turn the setting off again.
16. Change a help word: open src/content/help.ts, change a sentence, save, and reload. The panel should show your new words. You did not touch any other file.
17. Optional: on a phone with Expo Go, scan the QR code from `npx expo start` and go to the Design tab. Note: on phones the Design page may show as an extra tab for now. That is known.

If any step looks wrong, take a screenshot and tell me the step number.
