import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface User {
    role: Role;
    organisationId: string;
  }
  interface Session {
    user: { id: string; name: string; email: string; role: Role; organisationId: string };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: Role;
    organisationId: string;
  }
}
