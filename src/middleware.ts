import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Edge-safe instance — only the authConfig (no Prisma/bcrypt). The `authorized`
// callback gates every matched route.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except API routes, Next internals, and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts).*)"],
};
