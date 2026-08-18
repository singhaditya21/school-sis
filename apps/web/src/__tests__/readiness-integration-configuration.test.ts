const mockGetDatabaseHealth = jest.fn();
const mockGetIntegrationConfigurationHealth = jest.fn();
const mockGetMigrationHealth = jest.fn();
const mockGetPlatformDatabaseHealth = jest.fn();
const mockGetRateLimitHealth = jest.fn();
const mockGetTenantContextHealth = jest.fn();

jest.mock("@/lib/auth/api", () => ({
  requireBearerServiceAuth: jest.fn(() => null),
}));

jest.mock("@/lib/observability/snapshot", () => ({
  getDatabaseHealth: mockGetDatabaseHealth,
  getIntegrationConfigurationHealth: mockGetIntegrationConfigurationHealth,
  getMigrationHealth: mockGetMigrationHealth,
  getPlatformDatabaseHealth: mockGetPlatformDatabaseHealth,
  getTenantContextHealth: mockGetTenantContextHealth,
}));

jest.mock("@/lib/auth/rate-limit", () => ({
  getRateLimitHealth: mockGetRateLimitHealth,
}));

import { GET } from "@/app/api/ready/route";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("readiness integration-configuration gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "production";
    mockGetDatabaseHealth.mockResolvedValue({
      status: "healthy",
      latencyMs: 1,
    });
    mockGetMigrationHealth.mockResolvedValue({
      status: "healthy",
      reason: "current",
    });
    mockGetPlatformDatabaseHealth.mockResolvedValue({
      status: "healthy",
      role: "school_sis_platform",
      bypassVerified: true,
    });
    mockGetRateLimitHealth.mockResolvedValue({ status: "healthy" });
    mockGetTenantContextHealth.mockResolvedValue({ status: "healthy" });
  });

  afterAll(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  it.each([
    { status: "unhealthy", enforced: true, mockConnectionCount: null },
    { status: "healthy", enforced: false, mockConnectionCount: 0 },
    { status: "healthy", enforced: true, mockConnectionCount: 2 },
  ])(
    "returns 503 for an unproven integration audit %#",
    async (integrationConfiguration) => {
      mockGetIntegrationConfigurationHealth.mockResolvedValue(
        integrationConfiguration,
      );

      const response = await GET(new Request("https://example.test/api/ready"));
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload.status).toBe("not_ready");
      expect(payload.integrationConfiguration).toEqual(
        integrationConfiguration,
      );
    },
  );

  it("returns 200 when the production audit proves zero mock connections", async () => {
    mockGetIntegrationConfigurationHealth.mockResolvedValue({
      status: "healthy",
      enforced: true,
      mockConnectionCount: 0,
    });

    const response = await GET(new Request("https://example.test/api/ready"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ready" });
  });
});
