import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Standard single-instance handler.
//
// This previously constructed a fresh NextAuth() on every request from LINE
// credentials read out of DynamoDB. That path was removed because:
//   1. A runtime-writable identity-provider config reachable from the admin UI
//      lets one compromised admin session repoint login for every user.
//   2. It never actually worked: the config rows were written with PK/SK while
//      the akade-auth table is keyed pk/sk, so every write failed validation and
//      getActiveLineConfig() silently fell back to these same env vars.
// Credentials now come from the environment only.
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
