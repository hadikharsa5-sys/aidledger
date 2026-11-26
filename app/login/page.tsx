import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <h1 className="text-2xl font-semibold">Log in to AidLedger</h1>
      <Suspense>
        <Login searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  await connection();
  const { callbackUrl } = await searchParams;
  const target = typeof callbackUrl === "string" ? toPath(callbackUrl) : "/";
  if (await auth()) redirect(target);
  return <LoginForm callbackUrl={target} />;
}

// The proxy passes the full URL; keep only the path so we never redirect off-site.
function toPath(url: string) {
  try {
    const { pathname, search } = new URL(url, "http://localhost");
    return pathname + search;
  } catch {
    return "/";
  }
}
