import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("./client", () => ({
  ddb: { send: (...args: unknown[]) => send(...args) },
  TABLES: {},
}));

const { batchPutAll } = await import("./batch");

const noSleep = async () => {};
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }));

/** PutRequest items in the order one BatchWriteCommand carried them. */
function sentIds(callIndex: number): string[] {
  const input = send.mock.calls[callIndex][0].input as {
    RequestItems: Record<string, { PutRequest: { Item: { id: string } } }[]>;
  };
  return Object.values(input.RequestItems)[0].map((r) => r.PutRequest.Item.id);
}

describe("batchPutAll", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it("writes nothing for an empty list", async () => {
    await batchPutAll("t", [], { sleep: noSleep });
    expect(send).not.toHaveBeenCalled();
  });

  it("splits into DynamoDB's 25-item batches", async () => {
    await batchPutAll("t", items(60), { sleep: noSleep });
    expect(send).toHaveBeenCalledTimes(3);
    expect(sentIds(0)).toHaveLength(25);
    expect(sentIds(1)).toHaveLength(25);
    expect(sentIds(2)).toHaveLength(10);
  });

  it("re-sends whatever comes back unprocessed", async () => {
    send
      .mockResolvedValueOnce({ UnprocessedItems: { t: [{ PutRequest: { Item: { id: "i1" } } }] } })
      .mockResolvedValueOnce({});

    await batchPutAll("t", items(3), { sleep: noSleep });

    expect(send).toHaveBeenCalledTimes(2);
    expect(sentIds(0)).toEqual(["i0", "i1", "i2"]);
    expect(sentIds(1)).toEqual(["i1"]);
  });

  it("gives up with a clear error when items stay unprocessed", async () => {
    send.mockResolvedValue({ UnprocessedItems: { t: [{ PutRequest: { Item: { id: "i0" } } }] } });

    await expect(batchPutAll("t", items(1), { maxAttempts: 2, sleep: noSleep })).rejects.toThrow(
      /1 unprocessed item\(s\) for t after 2 attempt\(s\)/
    );
  });
})
