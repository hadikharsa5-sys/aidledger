import { connection } from "next/server";
import { auth } from "@/auth";
import { logout } from "./login/actions";

const ROLE_LABELS = { ADMIN: "Admin", MANAGER: "Manager", COORDINATOR: "Coordinator", VOLUNTEER: "Volunteer" };

export async function UserMenu() {
  await connection();
  const session = await auth();
  if (!session) return null;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-2 text-sm">
      <span>
        {session.user.name} · {ROLE_LABELS[session.user.role]}
      </span>
      <form action={logout}>
        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1 font-medium">
          Log out
        </button>
      </form>
    </header>
  );
}
