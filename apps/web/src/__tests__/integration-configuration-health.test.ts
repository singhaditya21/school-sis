const mockPoolQuery = jest.fn();
const mockProductionAuditJustification = {
  id: "integration.production-audit",
  reason: "Test production integration configuration audit.",
};
const mockRunWithRlsBypass = jest.fn(
  async (_justification: unknown, operation: () => Promise<unknown>) =>
    operation(),
);

jest.mock("@/lib/db", () => ({
  pool: { query: mockPoolQuery },
  RLS_BYPASS_JUSTIFICATIONS: {
    PRODUCTION_INTEGRATION_AUDIT: mockProductionAuditJustification,
  },
  runWithRlsBypass: mockRunWithRlsBypass,
  runWithTenantContext: jest.fn(),
}));

import { getIntegrationConfigurationHealth } from "@/lib/observability/snapshot";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("integration configuration readiness", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockRunWithRlsBypass.mockClear();
    process.env.NODE_ENV = "production";
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it("does not query the database outside production", async () => {
    process.env.NODE_ENV = "test";

    await expect(getIntegrationConfigurationHealth()).resolves.toEqual({
      status: "healthy",
      enforced: false,
      mockConnectionCount: null,
    });
    expect(mockRunWithRlsBypass).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("reports healthy only after a cross-tenant audit finds no mock rows", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ count: 0 }] });

    await expect(getIntegrationConfigurationHealth()).resolves.toEqual({
      status: "healthy",
      enforced: true,
      mockConnectionCount: 0,
    });
    expect(mockRunWithRlsBypass).toHaveBeenCalledWith(
      mockProductionAuditJustification,
      expect.any(Function),
    );
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    const sql = String(mockPoolQuery.mock.calls[0]?.[0]);
    expect(sql).toContain("mode = 'MOCK'");
    expect(sql).toContain("config ->> 'mock' = 'true'");
  });

  it("fails closed when persisted mock configuration exists", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ count: 2 }] });

    await expect(getIntegrationConfigurationHealth()).resolves.toEqual({
      status: "unhealthy",
      enforced: true,
      mockConnectionCount: 2,
    });
  });

  it("fails closed when the production audit cannot be proven", async () => {
    mockPoolQuery.mockRejectedValue(new Error("database unavailable"));

    await expect(getIntegrationConfigurationHealth()).resolves.toEqual({
      status: "unhealthy",
      enforced: true,
      mockConnectionCount: null,
    });
  });

  it("fails closed when the production audit returns an ambiguous shape", async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ count: 0 }, { count: 0 }] });

    await expect(getIntegrationConfigurationHealth()).resolves.toEqual({
      status: "unhealthy",
      enforced: true,
      mockConnectionCount: null,
    });
  });

  it.each([null, "", "0.5", -1])(
    "fails closed for malformed count %p",
    async (count) => {
      mockPoolQuery.mockResolvedValue({ rows: [{ count }] });

      await expect(getIntegrationConfigurationHealth()).resolves.toEqual({
        status: "unhealthy",
        enforced: true,
        mockConnectionCount: null,
      });
    },
  );
});
