"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { responseMessage, secureFetch } from "@/lib/auth/client";
import type { AppSession } from "@/lib/auth/session";

type SessionContextValue = AppSession & {
  signingOut: boolean;
  signOutUser: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function AuthProvider({ session, children }: { session: AppSession; children: React.ReactNode }) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOutUser() {
    setSigningOut(true);
    try {
      const response = await secureFetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error(await responseMessage(response, "Sign out failed. Refresh the page and try again."));
      window.location.assign("/login");
    } catch (error) {
      setSigningOut(false);
      window.alert(error instanceof Error ? error.message : "Sign out failed. Refresh the page and try again.");
    }
  }

  const value = useMemo<SessionContextValue>(() => ({ ...session, signingOut, signOutUser }), [session, signingOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must run inside AuthProvider");
  return value;
}
