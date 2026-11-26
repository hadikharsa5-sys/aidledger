import type { NextAuthConfig } from "next-auth";

// Volunteers share phones, so a session ends after this much inactivity.
// The proxy re-issues the session cookie on every request, so the clock
// restarts whenever the user does something.
export const SESSION_IDLE_SECONDS = 15 * 60;

const PUBLIC_PATHS = ["/login"];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: SESSION_IDLE_SECONDS },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      if (PUBLIC_PATHS.includes(request.nextUrl.pathname)) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        token.organisationId = user.organisationId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role;
      session.user.organisationId = token.organisationId;
      return session;
    },
  },
} satisfies NextAuthConfig;
