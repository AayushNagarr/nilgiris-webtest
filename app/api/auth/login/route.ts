import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, SESSION_TTL_SECONDS, createSessionToken, verifyAccessCode } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";

  if (!code) {
    return NextResponse.json({ error: "Enter an access code." }, { status: 400 });
  }

  const name = verifyAccessCode(code);
  if (!name) {
    return NextResponse.json({ error: "That code isn't recognized." }, { status: 401 });
  }

  const token = await createSessionToken(name);
  const res = NextResponse.json({ ok: true, name });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
