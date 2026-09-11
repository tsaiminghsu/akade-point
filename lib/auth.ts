import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { DynamoDBAdapter } from "@next-auth/dynamodb-adapter";
import type { NextAuthOptions } from "next-auth";
import LineProvider from "next-auth/providers/line";
import { upsertUser } from "./dynamo/users";

const dynamoClient = DynamoDBDocument.from(
  new DynamoDB({ region: process.env.AWS_REGION ?? "ap-northeast-1" }),
  { marshallOptions: { removeUndefinedValues: true } }
);

function buildCallbacks(): NextAuthOptions["callbacks"] {
  return {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const lineProfile = profile as {
          sub?: string;
          name?: string;
          picture?: string;
          email?: string;
        };
        const userId = token.sub ?? lineProfile.sub ?? token.sub!;
        await upsertUser(userId, {
          displayName: lineProfile.name ?? token.name ?? undefined,
          email: lineProfile.email ?? token.email ?? undefined,
          lineImage: lineProfile.picture ?? undefined,
        });
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  };
}

/** Static auth options using env vars — used for getServerSession() calls only. */
export const authOptions: NextAuthOptions = {
  adapter: DynamoDBAdapter(dynamoClient, { tableName: "akade-auth" }),
  providers: [
    LineProvider({
      clientId: process.env.LINE_CLIENT_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: buildCallbacks(),
  pages: { signIn: "/login" },
};

/** Builds auth options with specific LINE credentials (from DynamoDB or env). */
export function buildAuthOptions(clientId: string, clientSecret: string): NextAuthOptions {
  return {
    adapter: DynamoDBAdapter(dynamoClient, { tableName: "akade-auth" }),
    providers: [
      LineProvider({ clientId, clientSecret }),
    ],
    session: { strategy: "jwt" },
    callbacks: buildCallbacks(),
    pages: { signIn: "/login" },
  };
}
