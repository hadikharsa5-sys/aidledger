// @vitest-environment node
import { describe, expect, it } from "vitest";
import { authConfig, isLocalPath, SESSION_IDLE_SECONDS } from "@/auth.config";

type Authorized = Parameters<typeof authConfig.callbacks.authorized>[0];
const authorized = (pathname: string, loggedIn: boolean) =>
  authConfig.callbacks.authorized({
    request: { nextUrl: new URL(`http://localhost${pathname}`) },
    auth: loggedIn ? { user: { id: "u1" }, expires: "" } : null,
  } as unknown as Authorized);

describe("auth config", () => {
  it("expires the session after 15 minutes without activity", () => {
    expect(SESSION_IDLE_SECONDS).toBe(15 * 60);
    expect(authConfig.session).toEqual({ strategy: "jwt", maxAge: 15 * 60 });
  });

  it("sends logged-out visitors to the login page", () => {
    expect(authorized("/", false)).toBe(false);
    expect(authorized("/rounds", false)).toBe(false);
    expect(authorized("/login", false)).toBe(true);
    expect(authorized("/rounds", true)).toBe(true);
  });

  it("puts id, role and organisation in the token and the session", () => {
    const user = { id: "u1", name: "Rana", email: "r@test", role: "COORDINATOR" as const, organisationId: "org1" };
    type JwtArgs = Parameters<typeof authConfig.callbacks.jwt>[0];
    type SessionArgs = Parameters<typeof authConfig.callbacks.session>[0];
    const token = authConfig.callbacks.jwt({ token: {}, user } as unknown as JwtArgs);
    expect(token).toMatchObject({ sub: "u1", role: "COORDINATOR", organisationId: "org1" });

    const session = authConfig.callbacks.session({
      session: { user: { name: "Rana", email: "r@test" }, expires: "" },
      token,
    } as unknown as SessionArgs);
    expect(session.user).toMatchObject({ id: "u1", role: "COORDINATOR", organisationId: "org1" });
  });
});

describe("isLocalPath", () => {
  it.each(["/", "/rounds", "/rounds?id=1"])("allows %s", (url) => expect(isLocalPath(url)).toBe(true));
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", null, undefined])("refuses %s", (url) =>
    expect(isLocalPath(url)).toBe(false)
  );
});
