"use client";

import type { User } from "firebase/auth";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { firebaseAuth, firebaseDb, firebaseEnabled } from "@/lib/firebase/client";

type Role = "member" | "admin";

type Session = {
  user: User | null;
  role: Role;
  preview: boolean;
  loading: boolean;
  error: string;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(firebaseEnabled ? "member" : "admin");
  const [loading, setLoading] = useState(firebaseEnabled);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = firebaseAuth;
    const db = firebaseDb;
    if (!firebaseEnabled || !auth || !db) return;
    return onAuthStateChanged(auth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      if (!nextUser.email?.toLowerCase().endsWith("@triplecrownsports.com")) {
        setError("Use a triplecrownsports.com Google account to open the tracker.");
        await signOut(auth);
        setLoading(false);
        return;
      }
      setUser(nextUser);
      const userRef = doc(db, "users", nextUser.uid);
      const userSnapshot = await getDoc(userRef);
      if (!userSnapshot.exists()) {
        await setDoc(userRef, {
          email: nextUser.email,
          displayName: nextUser.displayName ?? nextUser.email,
          role: "member",
          createdAt: serverTimestamp()
        });
        setRole("member");
      } else {
        setRole(userSnapshot.data().role === "admin" ? "admin" : "member");
      }
      setLoading(false);
    });
  }, []);

  async function handleSignIn() {
    if (!firebaseAuth) return;
    setError("");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: "triplecrownsports.com" });
    await signInWithPopup(firebaseAuth, provider);
  }

  async function handleSignOut() {
    if (firebaseAuth) await signOut(firebaseAuth);
  }

  const session = useMemo<Session>(
    () => ({
      user,
      role,
      preview: !firebaseEnabled,
      loading,
      error,
      signIn: handleSignIn,
      signOutUser: handleSignOut
    }),
    [user, role, loading, error]
  );

  if (loading) return <div className="auth-state">Verifying your team account…</div>;
  if (firebaseEnabled && !user) {
    return (
      <main className="sign-in-shell">
        <section className="sign-in-card">
          <div className="brand-mark brand-mark-large">TCS</div>
          <p className="eyebrow">NIVC 2026</p>
          <h1>RPI Tracker</h1>
          <p>Sign in with your Triple Crown Sports Google account.</p>
          {error ? <div className="status-note status-note-error">{error}</div> : null}
          <button className="btn btn-primary" onClick={() => void handleSignIn()}>
            Sign in with Google
          </button>
        </section>
      </main>
    );
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must run inside AuthProvider");
  return value;
}
