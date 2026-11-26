import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Uses only auth.config.ts, not auth.ts: Netlify bundles the proxy as an edge
// function, which can't load Prisma, pg or bcrypt.
const { auth } = NextAuth(authConfig);

export const proxy = auth;

export const config = {
  // Everything except Auth.js's own routes and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
