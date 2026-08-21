# Invoice Gen

A free invoice generator that works with **zero setup**: open it, build an
invoice, save it — it's stored right in your browser (`localStorage`), no
account and no server required. Signing up is entirely optional, only
needed if you want your invoices to sync across devices.

## What's in this folder

```
index.html         the app (single page)
style.css           all styling
app.js               all logic: local storage save/load, optional cloud sync, live preview, PDF export
firebase-config.js     only needed if you turn on optional sync — see below
firestore.rules          only needed if you turn on optional sync — see below
README.md                 this file
```

## Just want to use it? You're done.

Open `index.html` in a browser (or host the folder anywhere — even a
plain static file host). There's no login screen. Build an invoice, hit
**Save invoice**, and it's kept in that browser's local storage. The
sidebar lists everything you've saved. **Download PDF** works the same
way, with no account either.

Because everything lives in that one browser on that one device:
- clearing your browser's site data deletes your saved invoices
- a different browser or device won't show the same list
- there's no server copy to recover from if local data is cleared

This is explained in-app too, under the **⋮ menu → Terms & Privacy**.

## Optional: sync across devices

If you want the same invoices on your phone and your laptop, the **⋮
menu → Sign up / sign in** lets you create a free account. This is
completely opt-in — nobody has to do this to use the app. Once signed
in, saves go to your own private Firebase account instead of local
storage; signing out switches back to local storage.

To turn this on, you need a free Firebase project:

### 1. Create the project
1. https://console.firebase.google.com → **Add project** → name it → finish.
   No credit card needed.
2. **Build → Authentication → Get started** → enable **Email/Password**.
3. **Build → Firestore Database → Create database** → production mode →
   pick a nearby region.

### 2. Connect the app
1. **Project settings** (gear icon) → **Your apps** → **</>** (web) →
   register an app → copy the `firebaseConfig` object it gives you.
2. Paste those values into **`firebase-config.js`**, replacing the
   `REPLACE_ME` placeholders.

   > This config is not a secret — it's fine to be public. Your data is
   > protected by the rules below, not by hiding this file.

### 3. Lock it down
Deploy `firestore.rules` so each signed-in person can only ever read or
write **their own** invoices:
- Firebase Console → **Firestore Database → Rules** → paste the file's
  contents → **Publish**. (Or `firebase deploy --only firestore:rules`
  with the CLI.)

If you never set this up, the sync option in the ⋮ menu just won't work
— the app still works fine on local storage alone.

### 4. Optional: host it online
```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # pick this folder as the public directory
firebase deploy
```

## How it decides where to save

- **Signed out (default):** every Save writes to `localStorage` under the
  key `invoiceGen.invoices.v1`. No network calls happen for save/load at
  all in this mode.
- **Signed in (opt-in):** Save writes to Firestore instead, tagged with
  your `ownerId`, and the sidebar lists live from your account. Signing
  out returns to local storage; your synced invoices aren't deleted, you
  just won't see them again until you sign back in.

## PDF generation

Built with jsPDF, drawn directly (not a screenshot of the page), using
only jsPDF's built-in fonts — the most common cause of broken or garbled
PDFs is a custom font failing to load, so this avoids that entirely. The
PDF pulls its numbers from the exact same `computeTotals()` function that
drives the on-screen total, so the two can never disagree.

Math: `subtotal → discount% → tax% on the discounted amount → total →
minus amount paid → balance due`. To apply tax before discount instead,
that's a one-line change in `computeTotals()` in `app.js`.

## Customizing

- Colors, fonts: top of `style.css` (`:root` block).
- PDF layout: `generatePDF()` in `app.js`.
- Terms & Privacy wording: the `#termsModalOverlay` block in `index.html`.
- Default due-date offset, starting invoice number: `resetFormToBlank()`
  in `app.js`.
