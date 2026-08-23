import { cookies } from "next/headers";
import Link from "next/link";
import { COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { LogoutButton } from "./LogoutButton";

export default async function BuilderLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-hairline bg-surface px-4 py-3 sm:px-6">
        <Link href="/builder" className="flex items-baseline gap-2">
          <span className="font-sans text-lg font-semibold">Nilgiris</span>
          <span className="elevation-label hidden sm:inline">Level Builder</span>
        </Link>
        <div className="flex items-center gap-4">
          {session && (
            <span className="elevation-label">
              Tester: <span className="text-mist normal-case tracking-normal">{session.name}</span>
            </span>
          )}
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
