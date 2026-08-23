"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TopoBackground } from "@/components/TopoBackground";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't sign in.");
      return;
    }
    router.push(params.get("next") ?? "/builder");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <TopoBackground className="text-moss" />
      <div className="relative w-full max-w-sm border border-hairline bg-surface p-8">
        <div className="elevation-label mb-1">Elev. 2240m — Level Builder</div>
        <h1 className="mb-6 font-sans text-2xl font-semibold">Nilgiris</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label htmlFor="code" className="elevation-label">
            Access code
          </label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="TESTER-XXXX"
            autoComplete="off"
            autoFocus
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={loading || !code} className="mt-2">
            {loading ? "Checking…" : "Enter"}
          </Button>
        </form>
        <p className="mt-6 text-xs text-muted">
          Codes are issued per playtester. Ask the project owner if you need one.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
