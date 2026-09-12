/**
 * Global setup for the `integration` vitest project.
 *
 * These tests run against a real DynamoDB Local instance, because the
 * properties worth testing here — ConditionExpression semantics, atomic ADD,
 * TransactWriteItems cancellation reasons, GSI ordering, BatchWrite chunking —
 * are exactly the things a mocked SDK client cannot verify.
 *
 * Locally:  npm run dynamodb:local   (scripts/start-dynamodb-local.mjs, port 8500)
 * In CI:    the amazon/dynamodb-local service container, mapped to 8500
 */
export default async function setup() {
  const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
  if (!endpoint) {
    throw new Error(
      'Integration tests require DYNAMODB_LOCAL_ENDPOINT (e.g. http://localhost:8500).\n' +
        'Start it with: npm run dynamodb:local'
    );
  }

  // Isolate integration tables from any local dev data.
  process.env.TABLE_PREFIX ??= 'test-';
  process.env.AWS_REGION ??= 'ap-northeast-1';

  const res = await fetch(endpoint).catch(() => null);
  if (!res) {
    throw new Error(`Cannot reach DynamoDB Local at ${endpoint}. Is it running?`);
  }
}
