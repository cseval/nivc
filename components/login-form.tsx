"use client";

import { FirebaseError } from "firebase/app";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "firebase/auth";
import { FormEvent, useState } from "react";
import { responseMessage, secureFetch } from "@/lib/auth/client";
import { isAllowedEmail, normalizeEmail } from "@/lib/auth/policy";
import { firebaseAuth, firebaseEnabled } from "@/lib/firebase/client";

type Mode = "sign-in" | "register" | "reset" | "verify";

function firebaseMessage(error: unknown): string {
  if (!(error instanceof FirebaseError)) {
    return error instanceof Error ? error.message : "The request could not be completed. Try again.";
  }
  switch (error.code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password wasn't accepted. Check both and try again.";
    case "auth/email-already-in-use":
      return "That account could not be created. Sign in or reset the password instead.";
    case "auth/weak-password":
      return "Use at least 12 characters with uppercase, lowercase, a number and a symbol.";
    case "auth/too-many-requests":
      return "Firebase temporarily limited sign-in attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Firebase could not be reached. Check your connection and try again.";
    case "auth/unauthorized-continue-uri":
    case "auth/unauthorized-domain":
      return "Firebase is not authorized for this site. Contact the app administrator.";
    case "auth/operation-not-allowed":
      return "Email and password accounts are not enabled. Contact the app administrator.";
    case "auth/invalid-api-key":
    case "auth/app-not-authorized":
      return "The Firebase configuration is invalid. Contact the app administrator.";
    default:
      return "Firebase could not complete the request. Check the information and try again.";
  }
}

function actionUrl(action: "verified" | "reset"): string {
  return new URL(`/login?${action}=1`, window.location.origin).toString();
}

export function LoginForm({ nextPath, initialNotice = "" }: { nextPath: string; initialNotice?: string }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);

  function chooseMode(nextMode: Mode) {
    if (pendingUser && firebaseAuth) void signOut(firebaseAuth);
    setMode(nextMode);
    setError("");
    setNotice("");
    setPendingUser(null);
  }

  function validateCompanyEmail(): string {
    const normalized = normalizeEmail(email);
    if (!isAllowedEmail(normalized)) throw new Error("Use your triplecrownsports.com email address.");
    return normalized;
  }

  async function handleSignIn() {
    if (!firebaseAuth) throw new Error("Firebase web configuration is missing. Add it to .env.local and restart the app.");
    const normalized = validateCompanyEmail();
    await setPersistence(firebaseAuth, inMemoryPersistence);
    const credential = await signInWithEmailAndPassword(firebaseAuth, normalized, password);
    if (!credential.user.emailVerified) {
      setPendingUser(credential.user);
      setMode("verify");
      setNotice("Verify your email before signing in. Use the link already sent, or send a new one below.");
      return;
    }
    const idToken = await credential.user.getIdToken(true);
    const response = await secureFetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    if (!response.ok) throw new Error(await responseMessage(response, "The secure session could not be created."));
    await signOut(firebaseAuth).catch(() => undefined);
    window.location.assign(nextPath);
  }

  async function handleRegister() {
    if (!firebaseAuth) throw new Error("Firebase web configuration is missing. Add it to .env.local and restart the app.");
    const normalized = validateCompanyEmail();
    if (!displayName.trim()) throw new Error("Enter your name so teammates can identify your updates.");
    if (password.length < 12) throw new Error("Use at least 12 characters for your password.");
    if (password !== confirmPassword) throw new Error("The passwords do not match.");
    await setPersistence(firebaseAuth, inMemoryPersistence);
    const credential = await createUserWithEmailAndPassword(firebaseAuth, normalized, password);
    await updateProfile(credential.user, { displayName: displayName.trim() });
    setPendingUser(credential.user);
    setMode("verify");
    try {
      await sendEmailVerification(credential.user, { url: actionUrl("verified") });
    } catch (verificationError) {
      throw new Error(`Your account was created, but the verification email was not sent. ${firebaseMessage(verificationError)}`);
    }
    setNotice(`Verification sent to ${normalized}. Open that message before signing in.`);
  }

  async function handleReset() {
    if (!firebaseAuth) throw new Error("Firebase web configuration is missing. Add it to .env.local and restart the app.");
    const normalized = validateCompanyEmail();
    await sendPasswordResetEmail(firebaseAuth, normalized, { url: actionUrl("reset") });
    setNotice(`If an account exists for ${normalized}, Firebase sent password-reset instructions.`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "sign-in") await handleSignIn();
      if (mode === "register") await handleRegister();
      if (mode === "reset") await handleReset();
    } catch (requestError) {
      setError(firebaseMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (!pendingUser || !firebaseAuth) return;
    setBusy(true);
    setError("");
    try {
      await sendEmailVerification(pendingUser, { url: actionUrl("verified") });
      await signOut(firebaseAuth);
      setPendingUser(null);
      setMode("sign-in");
      setPassword("");
      setNotice("Verification sent. Open the message, verify your address, then sign in.");
    } catch (requestError) {
      setError(firebaseMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!firebaseEnabled) {
    return <div className="status-note status-note-error">Firebase web configuration is missing. Complete `.env.local`, restart the app and reload this page.</div>;
  }

  return (
    <>
      <div className="auth-mode-tabs" role="tablist" aria-label="Account action">
        <button type="button" className={mode === "sign-in" ? "auth-tab active" : "auth-tab"} onClick={() => chooseMode("sign-in")}>Sign in</button>
        <button type="button" className={mode === "register" ? "auth-tab active" : "auth-tab"} onClick={() => chooseMode("register")}>Create account</button>
      </div>

      {notice ? <div className="status-note status-note-success" role="status">{notice}</div> : null}
      {error ? <div className="status-note status-note-error" role="alert">{error}</div> : null}

      {mode === "verify" ? (
        <div className="auth-action-stack">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void resendVerification()}>
            {busy ? "Sending verification…" : "Resend verification email"}
          </button>
          <button type="button" className="auth-link" onClick={() => chooseMode("sign-in")}>Return to sign in</button>
        </div>
      ) : (
        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          {mode === "register" ? (
            <div className="form-group">
              <label htmlFor="display-name">Your name</label>
              <input id="display-name" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Name shown to teammates" required />
            </div>
          ) : null}
          <div className="form-group">
            <label htmlFor="email">Team email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@triplecrownsports.com" required />
          </div>
          {mode !== "reset" ? (
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={12} required />
            </div>
          ) : null}
          {mode === "register" ? (
            <>
              <div className="form-group">
                <label htmlFor="confirm-password">Confirm password</label>
                <input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={12} required />
              </div>
              <p className="auth-helper">Use 12 or more characters with uppercase, lowercase, a number and a symbol.</p>
            </>
          ) : null}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? "Working…" : mode === "sign-in" ? "Sign in securely" : mode === "register" ? "Create team account" : "Send reset instructions"}
          </button>
          {mode === "sign-in" ? <button type="button" className="auth-link" onClick={() => chooseMode("reset")}>Forgot your password?</button> : null}
          {mode === "reset" ? <button type="button" className="auth-link" onClick={() => chooseMode("sign-in")}>Return to sign in</button> : null}
        </form>
      )}
    </>
  );
}
