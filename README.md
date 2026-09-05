# SeatBite — how to put this online (no coding needed)

This folder is a complete, ready-to-run website. Follow these steps exactly —
you will not need to type any code or use the command line.

## Part 1 — Put the files on GitHub

1. Go to https://github.com and sign in (or create a free account if you
   don't have one — "Sign up" in the top right).
2. Click the **+** icon in the top-right corner → **New repository**.
3. Give it a name, e.g. `seatbite`. Leave everything else as default.
   Click **Create repository**.
4. On the new (empty) repository page, click the link that says
   **"uploading an existing file"**.
5. On your computer, open this folder (`seatbite-app`) and **select
   everything inside it** (not the folder itself — the files and the `src`
   folder that are inside it). Drag them all into the GitHub upload box.
   GitHub will keep the folder structure automatically.
6. Scroll down, and click the green **Commit changes** button.

Your code is now on GitHub.

## Part 2 — Deploy it with Vercel (this gives you the real public link)

1. Go to https://vercel.com and click **Sign Up**.
2. Choose **Continue with GitHub** and approve the connection — this lets
   Vercel see your repositories.
3. On your Vercel dashboard, click **Add New → Project**.
4. Find the `seatbite` repository you just created and click **Import**.
5. Vercel will automatically detect this is a Vite + React project — you
   don't need to change any settings. Just click **Deploy**.
6. Wait about 1 minute. When it finishes, Vercel shows you a link like:
   `seatbite-yourname.vercel.app`
7. Open that link in a private/incognito browser tab to confirm it opens
   straight to the SeatBite home page with **no login required**.

That link is permanent, public, and free. Send it to me and I'll regenerate
the QR codes to point at it.

## Making a change later

Any time you (or I) want to update the app: edit the files on GitHub (or
upload new versions the same way as Part 1, step 4–6), and Vercel will
automatically rebuild and update your live link within a minute or two —
no extra steps needed.

## Setting up your shared live database (Firebase)

Orders now sync live across every device — a customer orders on their
phone, and it instantly shows up on the restaurant's phone and the
admin's phone too. To turn this on, you need your own free Firebase
project (a database from Google) and paste its connection details into
one file. Takes about 5 minutes, no coding involved.

1. Go to **https://console.firebase.google.com** and sign in with a
   Google account.
2. Click **"Add project"**, give it a name (e.g. `seatbite`), and click
   through the setup screens (you can turn Google Analytics off — not
   needed). Click **Create project**.
3. In the left sidebar, click **Build → Firestore Database**, then
   **Create database**.
4. Choose **"Start in test mode"** (fine for now — see the security
   note below), pick a location close to you (e.g. `asia-south1`
   Mumbai), and click **Enable**.
5. Click the **gear icon (top left) → Project settings**, scroll down
   to **"Your apps"**, and click the **`</>`** (web) icon to register a
   new web app. Give it any nickname and click **Register app**.
6. Firebase will show you a block of code containing a `firebaseConfig`
   object with values like `apiKey`, `authDomain`, `projectId`, etc.
   **Copy that whole object.**
7. Open `src/firebase.js` in this project, and replace the placeholder
   `firebaseConfig` object with the one you just copied.
8. Upload the changed `src/firebase.js` (and `package.json`, since
   Firebase was added as a new dependency) to GitHub the same way as
   always, and Render will redeploy automatically.

**Security note:** "test mode" allows anyone with your database address
to read and write orders — fine while you're building and testing, but
before handling real customer orders at scale, come back and I'll help
you tighten the Firestore rules so only your app can write to it
properly.

## Camera QR scanning

The home page now has a **"Scan QR with camera"** button that opens the
phone's real camera inside the browser and reads a QR code automatically —
no manual typing needed. Two things to know:
- It only works on the **live https link** (once deployed to
  Render/Vercel) — browsers block camera access on insecure links.
- The first time someone taps it, the browser will ask to **allow camera
  access** — they need to tap "Allow."

## Turning on real payments (Razorpay)

The "Pay" button now opens a real Razorpay checkout popup instead of a
fake demo button. Before this can take real (or test) payments, one thing
needs to be filled in:

1. Open `src/App.jsx` and find this line near the top:
   ```
   const RAZORPAY_KEY_ID = "rzp_test_REPLACE_WITH_YOUR_KEY";
   ```
2. Go to your Razorpay Dashboard → **Settings → API Keys**, and copy your
   **Key ID** (it starts with `rzp_test_` while testing, or `rzp_live_`
   once you're ready for real money).
3. Paste it in place of `"rzp_test_REPLACE_WITH_YOUR_KEY"`, save, and
   upload the changed file to GitHub the same way as before (Part 1).

**Good to know:** this connects the checkout popup directly from the
website, which is enough to actually take payments. What it does *not*
do yet is verify — behind the scenes — that a payment genuinely went
through before marking an order paid. That verification step needs a
tiny bit of server code (Render and Vercel both support this for free).
It's not urgent for testing/demos, but before handling real customer
money at scale, tell me and I'll add that verification step.

