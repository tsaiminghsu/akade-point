import NextAuth from "next-auth";
import { buildAuthOptions } from "@/lib/auth";
import { getActiveLineConfig } from "@/lib/auth/lineRuntimeConfig";
import { NextRequest } from "next/server";

async function createHandler(
  req: NextRequest,
  context: { params: { nextauth: string[] } }
) {
  const { clientId, clientSecret } = await getActiveLineConfig();
  // The App Router overload (request, route context, options) is typed; the
  // one-argument form returns an untyped handler that needed `any` casts.
  return NextAuth(req, context, buildAuthOptions(clientId, clientSecret));
}

export async function GET(req: NextRequest, context: { params: { nextauth: string[] } }) {
  return createHandler(req, context);
}

export async function POST(req: NextRequest, context: { params: { nextauth: string[] } }) {
  return createHandler(req, context);
}
