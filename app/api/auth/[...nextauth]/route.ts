import NextAuth from "next-auth";
import { buildAuthOptions } from "@/lib/auth";
import { getActiveLineConfig } from "@/lib/auth/lineRuntimeConfig";
import { NextRequest } from "next/server";

async function createHandler(
  req: NextRequest,
  context: { params: { nextauth: string[] } }
) {
  const { clientId, clientSecret } = await getActiveLineConfig();
  const handler = NextAuth(buildAuthOptions(clientId, clientSecret));
  return handler(req as any, context as any);
}

export async function GET(req: NextRequest, context: { params: { nextauth: string[] } }) {
  return createHandler(req, context);
}

export async function POST(req: NextRequest, context: { params: { nextauth: string[] } }) {
  return createHandler(req, context);
}
