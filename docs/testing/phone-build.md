# Putting Gyan on a real phone for the first time

Gyan has been built and checked for twelve rounds, and **every one of those checks ran in a web
browser**. No iPhone, no Android phone, no simulator has ever run this code. That is the single
biggest unknown in the project, and this document closes it.

There are two ways onto a phone. **Part 1 is Expo Go**: free, takes about five minutes, works
today, and is the right thing to try first. **Part 2 is the development build**: a proper
installable app, which is what you will keep using. Part 3 is what to actually look at once
Gyan is on the screen. Part 4 is what is deliberately not there yet.

A warning worth reading before you start: **expect things to look wrong.** Not broken,
necessarily, but wrong — text under the notch, the keyboard covering the box you are typing in,
a list that will not scroll. That is the normal cost of a first phone run, and finding those is
the entire point of doing it.

---

## Part 1: Expo Go, the five-minute look

Expo Go is a free app made by Expo. It runs your app inside itself, so there is nothing to build
and nothing to install beyond the one app from the store.

Every library Gyan uses is included in Expo Go, so this should simply work. If something is
missing, Part 2 is the answer.

### 1. Put Expo Go on your phone

Search for **Expo Go** in the App Store (iPhone) or Google Play (Android) and install it.

### 2. Start Gyan on your Mac

In Terminal, in the `gyan` folder:

```
npx expo start
```

A square pattern of black and white dots — a QR code — appears in the terminal.

### 3. Point your phone at it

- **iPhone:** open the Camera app and point it at the QR code. Tap the notification that appears.
- **Android:** open Expo Go, tap **Scan QR code**, and point it at the code.

Gyan loads on your phone. It is talking to your **test** Supabase project, the same one the web
app uses, so your notes and your login are the ones you already have.

**Your Mac and your phone have to be on the same wi-fi.** If nothing happens, that is the usual
reason. If your wi-fi blocks devices from seeing each other, run `npx expo start --tunnel`
instead, which routes through Expo's servers — slower, but it works anywhere.

### 4. When you are done

Press `Ctrl` and `C` in the terminal to stop it.

---

## Part 2: the development build

This makes a real app file you install on the phone once. It keeps working when your Mac is off,
it is what you will hand to anyone else, and it is the only route that works when Gyan later
needs something Expo Go does not carry.

### 5. What has already been set up for you

- The app has its permanent store names: **`com.gyantechai.gyan`** on both platforms. Neither
  store lets you change this after an app is published, so it is worth knowing it is now fixed.
- `eas.json` holds one build recipe, called **development**.
- The project is registered with Expo as **@kygeorge/gyan**.
- Your test Supabase address and public key are stored **with Expo**, not in the code, so the
  build can reach the database.

### 6. Android: install it from a link

The build runs on Expo's computers, not yours. Your free plan includes **15 Android and 15
iPhone builds**, so this costs nothing — but the free queue can be slow, and Expo warns of
**waits of 90 minutes or more** at busy times.

```
npx eas-cli@latest build --platform android --profile development
```

**This has already been run for you, and it worked.** You do not need the command above unless
you change the app. Open this page **on your Android phone** and tap Install:

https://expo.dev/accounts/kygeorge/projects/gyan/builds/30c6565b-1b3a-4600-9b38-8c36b2937c2b

Android will warn you that the app did not come from the Play Store. That warning is expected,
because it did not. Allow it.

Run the command above yourself only after you change the app and want a new build on the phone.

**You should see:** Gyan's icon on your home screen. Opening it shows a developer screen first.
Run `npx expo start --dev-client` on your Mac and the app connects to it.

### 7. iPhone: what it needs from you first

An iPhone will not install an app from a link the way Android will. Apple requires:

1. An **Apple Developer account**, which costs **$99 a year**. You can sign up at
   developer.apple.com.
2. Your iPhone registered with Apple by its device id. Once you have the account, run
   `npx eas-cli@latest device:create` and follow it.

After both, the build command is the same with `ios` in place of `android`.

If you would rather not pay $99 yet, **Part 1 covers the iPhone for free.** Expo Go on an iPhone
shows you the same layout problems a development build would.

---

## Part 3: what to look at, once it is on the screen

Go through these in order and write down anything that looks off. None of this has ever been
checked on a phone, so finding problems is a success, not a failure.

### 8. The top and bottom of every screen

**You should see:** no text or button hidden behind the notch, the camera cut-out, or the bar at
the bottom. Check Home, a note, and Settings.

### 9. The keyboard

Tap the search box on Home, then the **Paste text** box on New note.

**You should see:** the box you are typing in stays visible. If the keyboard covers it, that is a
real bug and worth telling me.

### 10. Scrolling

Open a long note and scroll the transcript. Open Settings → Data and privacy and scroll to the
bottom.

**You should see:** smooth scrolling that reaches the end. A list inside another list is the
usual place this goes wrong on a phone and is fine on the web.

### 11. Tapping

Try the small things: the `?` help button, the tick boxes on action items, the `✕` that clears
the search box.

**You should see:** each one responds to a normal tap. If you have to aim carefully, the target
is too small and I need to fix it.

### 12. Home with your real pile of notes

Your test account has **433 notes**, 300 of them fake ones titled `[test]`.

**You should see:** Home opens quickly with 10 notes, and **Show more** adds 20 each time.
Searching a word and using the date filters should feel about as fast as the web.

### 13. Settings → Data and privacy

**You should see:** `433 notes, showing the 10 newest` above the list, with a **Show more**
button. This screen used to draw all 433 at once; that was fixed on 23 November 2026.

### 14. The side chat and translation

Open a note, tap **Ask**, and ask it something. Then tap **Translate**.

**You should see:** the same answers as on the web, with **Translated by AI** and a **Show
original** toggle on anything translated.

---

## Part 4: what is deliberately not there

**Recording does not exist.** On the New note screen, **Record** and **Meeting link** are both
greyed out and say **Coming soon**. There is no recording code in Gyan at all, on any platform.
So the phone will never ask for microphone permission, and you cannot record a meeting with it
yet. Notes get in by **upload** or **pasted text**.

**The meeting bot does not exist.** Sending a bot to Zoom, Google Meet or Teams is in the
product plan and is not built.

**Nothing here has been tested by me on a phone.** I set the build up and checked that the
JavaScript bundles correctly for Android, but I have no phone. Everything in Part 3 is a thing I
expect to work and cannot prove.

**The app icon and splash screen have never been seen on a device.** They are set up, but how
they actually look on a home screen is unknown until you look.

**Six packages are a patch version behind** what Expo recommends for SDK 58. Not a problem for
this build; worth tidying in its own round, because upgrading them could move the 1312 tests.
