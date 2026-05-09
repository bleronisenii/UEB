"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function getAuthErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    switch (code) {
      case "auth/invalid-email":
        return "Email i pavlefshëm.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Email ose fjalëkalim i gabuar.";
      case "auth/too-many-requests":
        return "Shumë përpjekje. Provoni më vonë.";
      case "auth/configuration-not-found":
        return "Firebase Auth nuk është aktivizuar ose .env.local nuk përputhet me projektin. Hapni Authentication në Firebase Console dhe aktivizoni Email/Password; kopjoni sërish çelësat nga Project settings → Your apps.";
      case "auth/invalid-api-key":
        return "API key i pavlefshëm. Kontrolloni NEXT_PUBLIC_FIREBASE_API_KEY në .env.local (Project settings → Your apps).";
      case "auth/operation-not-allowed":
        return "Ky mënyrë hyrjeje nuk është aktivizuar. Në Firebase Console → Authentication → Sign-in method, aktivizoni Email/Password.";
      default:
        break;
    }
  }
  return err instanceof Error ? err.message : "Gabim. Provoni përsëri.";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [authLoading, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const auth = getFirebaseAuth();
    const trimmed = email.trim();

    try {
      await signInWithEmailAndPassword(auth, trimmed, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      alert(getAuthErrorMessage(err));
    }
  }

  if (authLoading) {
    return (
      <div className="login-page" id="container">
        <div id="left-container">
          <div className="card">
            <p>Duke u ngarkuar…</p>
          </div>
        </div>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="login-page" id="container">
      <div id="left-container">
        <div className="card">
          <div className="login-page-toolbar">
            <ThemeToggle />
          </div>
          <h1>Hyrje</h1>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">Fjalëkalimi</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Fjalëkalimi"
                required
              />
            </div>

            <button id="addBtn" type="submit">
              Hyr
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
