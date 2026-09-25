import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { safeReturnPath } from "@/lib/auth/policy";
import { getOptionalSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parameters = await searchParams;
  const nextParameter = Array.isArray(parameters.next) ? parameters.next[0] : parameters.next;
  const nextPath = safeReturnPath(nextParameter);
  const session = await getOptionalSession();
  if (session) redirect(nextPath);
  const verified = Array.isArray(parameters.verified) ? parameters.verified[0] : parameters.verified;
  const reset = Array.isArray(parameters.reset) ? parameters.reset[0] : parameters.reset;

  return (
    <main className="sign-in-shell">
      <section className="sign-in-card">
        <div className="auth-brand">
          <div className="brand-mark brand-mark-large">TCS</div>
          <p className="eyebrow">NIVC 2026</p>
          <h1>RPI Tracker</h1>
          <p>Use your verified Triple Crown Sports email to open the internal tracker.</p>
        </div>
        <LoginForm
          nextPath={nextPath}
          initialNotice={verified === "1"
            ? "Email verified. Sign in to continue."
            : reset === "1" ? "Password updated. Sign in with your new password." : ""}
        />
      </section>
    </main>
  );
}
