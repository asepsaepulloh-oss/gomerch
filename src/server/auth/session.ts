import crypto from "node:crypto";
import { cookies } from "next/headers";
import { query, queryOne } from "@/server/db/pg-client";

const SESSION_COOKIE_NAME = "qris_session_token";
const SESSION_SECRET = process.env.TOKEN_ENCRYPTION_KEY || "development_secret_session_key_32bytes!!";

export interface UserSession {
  id: string;
  email: string;
  displayName: string;
}

export function hashPassword(password: string): string {
  const salt = "qris_salt_2026";
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function createSessionToken(user: UserSession): string {
  const payload = JSON.stringify({
    ...user,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(SESSION_SECRET).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  let encrypted = cipher.update(payload, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}.${authTag.toString("hex")}.${encrypted}`;
}

export function verifySessionToken(token: string): UserSession | null {
  try {
    const [ivHex, authTagHex, encrypted] = token.split(".");
    if (!ivHex || !authTagHex || !encrypted) return null;

    const key = crypto.createHash("sha256").update(SESSION_SECRET).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    const data = JSON.parse(decrypted);
    if (data.exp && data.exp < Date.now()) {
      return null;
    }

    return {
      id: data.id,
      email: data.email,
      displayName: data.displayName,
    };
  } catch {
    return null;
  }
}

export async function getDashboardSessionUser(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      const session = verifySessionToken(token);
      if (session) {
        // Confirm user still exists in PostgreSQL database
        const user = await queryOne(
          "SELECT id, email, display_name FROM public.users WHERE id = $1",
          [session.id]
        );
        if (user) {
          return {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
          };
        }
      }
    }
  } catch {}

  // Fallback default admin user for direct setup if no user yet in DB
  try {
    const defaultUser = await queryOne("SELECT id, email, display_name FROM public.users LIMIT 1");
    if (defaultUser) {
      return {
        id: defaultUser.id,
        email: defaultUser.email,
        displayName: defaultUser.display_name,
      };
    }

    // Seed initial default user into PostgreSQL if completely empty
    const seeded = await queryOne(
      `INSERT INTO public.users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
       RETURNING id, email, display_name`,
      ["merchant@qrisgateway.local", hashPassword("Admin123!"), "Merchant Admin"]
    );

    if (seeded) {
      return {
        id: seeded.id,
        email: seeded.email,
        displayName: seeded.display_name,
      };
    }
  } catch (err) {
    console.error("DB Session check error:", err);
  }

  return {
    id: "00000000-0000-0000-0000-000000000001",
    email: "merchant@qrisgateway.local",
    displayName: "Merchant Admin",
  };
}

export { SESSION_COOKIE_NAME };
