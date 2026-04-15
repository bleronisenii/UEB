import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

let app: FirebaseApp | undefined;

function getAppInstance(): FirebaseApp {
  if (app) {
    return app;
  }
  if (getApps().length > 0) {
    app = getApp();
    return app;
  }
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error(
      "Missing Firebase configuration. Copy .env.local.example to .env.local and set NEXT_PUBLIC_FIREBASE_* variables."
    );
  }
  app = initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getAppInstance());
}

export function getFirebaseFirestore(): Firestore {
  return getFirestore(getAppInstance());
}
