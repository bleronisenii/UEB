"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { ExpenseOwnerKey } from "@/types/userApp";
import { WithdrawalView } from "@/components/withdrawal/WithdrawalView";

export function WithdrawalPage({ ownerKey }: { ownerKey: ExpenseOwnerKey }) {
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

  return <WithdrawalView user={user} ownerKey={ownerKey} />;
}
