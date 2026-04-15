"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { EurMkdRateProvider } from "@/contexts/EurMkdRateContext";
import { ThemeProvider } from "@/contexts/ThemeContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <EurMkdRateProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </EurMkdRateProvider>
    </AuthProvider>
  );
}
