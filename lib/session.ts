import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Actor } from "@/lib/pickups";

/**
 * The signed-in user as an Actor for the lib functions, taken from the
 * session (never from form data). Sends the user to /login when there is no
 * session, for example after the idle timeout.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return {
    userId: session.user.id,
    role: session.user.role,
    organisationId: session.user.organisationId,
  };
}
