"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { HistoryErrorBoundary } from "@/components/history/HistoryErrorBoundary";
import { HistoryView } from "@/components/history/HistoryView";

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div id="container">
        <div id="right-container">
          <div id="dashboard">
            <p>Duke u ngarkuar…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <HistoryErrorBoundary>
      <HistoryView user={user} />
    </HistoryErrorBoundary>
  );
}
