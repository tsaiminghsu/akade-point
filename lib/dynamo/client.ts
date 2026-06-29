import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "ap-northeast-1",
});

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  AUTH: "akade-auth",
  USERS: "akade-users",
  CARDS: "akade-cards",
  REGISTRATIONS: "akade-registrations",
  SESSIONS: "akade-sessions",
  SHOPS: "akade-shops",
  REWARDS: "akade-rewards",
} as const;
