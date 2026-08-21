# Invoice Gen

A free, self-hosted invoice generator: sign in, build an invoice, save it to
your own Firebase account, and download a clean PDF. No backend server, no
paid plan — it runs entirely as static files + Firebase's free tier.

## What's in this folder

```
index.html         the app (single page)
style.css           all styling
app.js               all logic: auth, form, live preview, save/load, PDF export
firebase-config.js     ← you edit this with your own project's keys
firestore.rules          ← deploy this so invoices are private per-user
README.md                 this file
```

## 1. Create your Firebase project (free)

1. Go to https://console.firebase.google.com → **Add project** → name it
   (e.g. "invoice-gen") → finish the wizard. No credit card needed for what
   this app uses.
2. In the left menu: **Build → Authentication → Get started** → enable the
   **Email/Password** sign-in provider.
3. In the left menu: **Build → Firestore Database → Create database** →
   start in **production mode** → pick any region close to you.

## 2. Connect the app to your project

1. In Firebase Console: **Project settings** (gear icon) → scroll to
   **Your apps** → click the **</>** (web) icon → register an app (any
   nickname) → it shows you a `firebaseConfig` object.
2. Copy that object's values into **`firebase-config.js`** in this folder,
   replacing the `REPLACE_ME` placeholders.

   > This config is safe to be public — it's not a secret key. Your data is
   > actually protected by the security rules in step 3, not by hiding this
   > file.

## 3. Lock down your data (important — do this before real use)

Deploy `firestore.rules` so each person can only ever read, edit, or delete
**their own** invoices:

- Easiest way: Firebase Console → **Firestore Database → Rules** tab →
  paste the contents of `firestore.rules` → **Publish**.
- Or, with the Firebase CLI: `firebase deploy --only firestore:rules`.

Without this step, anyone could technically read or write any invoice —
don't skip it.

## 4. Run it

**Locally, to test:** just open `index.html` in a browser. Auth and
Firestore work fine from a local file as long as your Firebase project
allows `localhost` (it does by default).

**To put it online for free**, use Firebase Hosting:

```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # pick this folder as the public directory
firebase deploy
```

You'll get a free `https://your-project.web.app` URL.

## How the pieces work

- **Auth** — email/password sign-up and sign-in via Firebase Auth. Each
  invoice is tagged with `ownerId` on save.
- **Save** — writes to a Firestore collection called `invoices`. The
  sidebar lists your saved invoices in real time and lets you reopen or
  delete them.
- **PDF** — generated entirely in the browser with jsPDF, drawn manually
  (not a screenshot of the page), so text stays crisp and selectable and
  the layout can't shift or clip. Only jsPDF's built-in fonts are used —
  that avoids the most common cause of broken/garbled PDFs (a custom font
  failing to load). Numbers always come from the same `computeTotals()`
  function that drives the on-screen total, so the PDF and the preview can
  never disagree.
- **Math** — `subtotal → discount% → tax% on the discounted amount → total
  → minus amount paid → balance due`. If you'd rather tax apply before
  discount, that's a one-line change in `computeTotals()` in `app.js`.

## Security notes

- Firestore rules (step 3) are what actually keep invoices private —
  enforced server-side, not just hidden in the UI.
- Passwords are handled entirely by Firebase Auth; this app never sees or
  stores them itself.
- The logo you upload is stored as a compressed data URL inside your own
  invoice document (capped at 1.5MB) — no Firebase Storage bucket needed,
  which keeps setup to just Auth + Firestore.
- For extra protection against scripted abuse later, Firebase Console →
  **App Check** can be enabled for free — not required to start.

## Customizing

- Colors, fonts: top of `style.css` (`:root` block).
- PDF layout: `generatePDF()` in `app.js`.
- Default due-date offset, starting invoice number: `resetFormToBlank()`
  in `app.js`.
