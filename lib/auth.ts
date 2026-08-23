import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "nilgiris_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it in your .env.local / deployment env vars."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Parses ACCESS_CODES env var of the form "CODE:Name,CODE2:Name2" into a map.
 * Codes are matched case-sensitively; trim whitespace when setting the env var.
 */
function parseAccessCodes(): Map<string, string> {
  const raw = process.env.ACCESS_CODES ?? "";
  const map = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const [code, name] = trimmed.split(":");
    if (code) map.set(code.trim(), (name ?? code).trim());
  }
  return map;
}

/** Returns the tester's display name if the code is valid, otherwise null. */
export function verifyAccessCode(code: string): string | null {
  const codes = parseAccessCodes();
  return codes.get(code.trim()) ?? null;
}

export async function createSessionToken(name: string): Promise<string> {
  return new SignJWT({ name })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string
): Promise<{ name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.name === "string") return { name: payload.name };
    return null;
  } catch {
    return null;
  }
}

export { COOKIE_NAME, SESSION_TTL_SECONDS };
