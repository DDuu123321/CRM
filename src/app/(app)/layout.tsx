import Link from "next/link";

import { auth, signOut } from "@/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <Link href="/leads" className="font-semibold">
          Bluven CRM
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-500">
            {session?.user?.email}
            {session?.user?.role ? ` · ${session.user.role}` : ""}
          </span>
          <form action={logout}>
            <button className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
