import type { Metadata } from "next";
import "@/app/globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { Sidebar } from "@/components/sidebar";
import { getOptionalSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "NIVC RPI Tracker",
  description: "Shared 2026 NIVC RPI and outreach tracker"
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getOptionalSession();
  return (
    <html lang="en">
      <body>
        {session ? (
          <AuthProvider session={session}>
            <div className="app-shell">
              <Sidebar />
              <main className="main-content">{children}</main>
            </div>
          </AuthProvider>
        ) : children}
      </body>
    </html>
  );
}
