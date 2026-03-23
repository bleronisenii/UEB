"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

function getAuthErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    switch (code) {
      case "auth/email-already-in-use":
        return "Ky email është tashmë i regjistruar.";
      case "auth/weak-password":
        return "Fjalëkalimi është shumë i shkurtër (minimum 6 karaktere).";
      case "auth/invalid-email":
        return "Email i pavlefshëm.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Email ose fjalëkalim i gabuar.";
      case "auth/too-many-requests":
        return "Shumë përpjekje. Provoni më vonë.";
      default:
        break;
    }
  }
  return err instanceof Error ? err.message : "Gabim. Provoni përsëri.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const auth = getFirebaseAuth();
    const trimmed = email.trim();

    if (mode === "signup") {
      if (password !== confirmPassword) {
        alert("Fjalëkalimet nuk përputhen.");
        return;
      }
      if (password.length < 6) {
        alert("Fjalëkalimi duhet të ketë të paktën 6 karaktere.");
        return;
      }
      try {
        await createUserWithEmailAndPassword(auth, trimmed, password);
        router.push("/dashboard");
        router.refresh();
      } catch (err) {
        alert(getAuthErrorMessage(err));
      }
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, trimmed, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      alert(getAuthErrorMessage(err));
    }
  }

  return (
    <div className="login-page" id="container">
      <div id="left-container">
        <div className="card">
          <h1>{mode === "login" ? "Hyrje" : "Regjistrohu"}</h1>

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
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Fjalëkalimi"
                required
                minLength={mode === "signup" ? 6 : undefined}
              />
            </div>

            {mode === "signup" && (
              <div className="form-group">
                <label htmlFor="login-confirm">Përsërit fjalëkalimin</label>
                <input
                  id="login-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Përsërit fjalëkalimin"
                  required
                  minLength={6}
                />
              </div>
            )}

            <button id="addBtn" type="submit">
              {mode === "login" ? "Hyr" : "Krijo llogari"}
            </button>
          </form>

          <p className="login-toggle">
            {mode === "login" ? (
              <>
                Nuk keni llogari?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setConfirmPassword("");
                  }}
                >
                  Regjistrohu
                </button>
              </>
            ) : (
              <>
                Keni llogari?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setConfirmPassword("");
                  }}
                >
                  Hyr
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
