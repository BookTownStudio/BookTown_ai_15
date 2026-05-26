import { describe, expect, it } from "vitest";
import { apiContracts } from "../../../contracts/apiContracts";

describe("notification summary contract", () => {
  it("exposes server-owned notificationSummary as the app-shell read path", () => {
    const contract = apiContracts.callable.getNotificationSummary;

    expect(contract).toBeDefined();
    expect(contract.transport).toBe("httpsCallable");
    expect(contract.requestSchema.parse({})).toEqual({});
    expect(
      contract.responseSchema.parse({
        success: true,
        data: {
          unreadCount: 0,
          latestNotificationAt: null,
          lastReadAt: null,
        },
      })
    ).toEqual({
      success: true,
      data: {
        unreadCount: 0,
        latestNotificationAt: null,
        lastReadAt: null,
      },
    });
  });
});
