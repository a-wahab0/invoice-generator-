// ============================================================
// PASTE YOUR OWN FIREBASE CONFIG HERE.
// Get this from: Firebase Console → Project Settings → General
// → "Your apps" → Web app (</>) → SDK setup and configuration.
//
// This is safe to be public in client code — it is NOT a secret.
// Your data is protected by firestore.rules (server-side), not by
// hiding this object. See README.md for full setup steps.
// ============================================================
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
