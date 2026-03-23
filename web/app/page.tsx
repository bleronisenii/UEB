"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="login-page" id="container">
      <div id="left-container">
        <div className="card">
          <h1>Budget App</h1>
          <p className="home-intro">Zgjidhni një opsion:</p>
          <div id="buttons">
            <button type="button" onClick={() => router.push("/login")}>
              Hyr
            </button>
            <button type="button" onClick={() => router.push("/dashboard")}>
              Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
