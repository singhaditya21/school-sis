import { validateSecurityEnvironment } from "@/lib/security/env";

describe("production rate-limit environment contract", () => {
  const names = [
    "NODE_ENV",
    "DATABASE_URL",
    "PLATFORM_DATABASE_URL",
    "SESSION_SECRET",
    "PII_ENCRYPTION_KEY",
    "ENCRYPTION_KEY",
    "TENANT_CONTEXT_SIGNING_KEY_ID",
    "TENANT_CONTEXT_SIGNING_SECRET",
    "TENANT_CONTEXT_AUDIENCE",
    "RATE_LIMIT_BACKEND",
    "DISABLE_RATE_LIMIT",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ] as const;
  const original = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgresql://postgres:password@localhost:5432/school_sis";
    process.env.PLATFORM_DATABASE_URL =
      "postgresql://postgres:password@localhost:5432/school_sis";
    process.env.SESSION_SECRET = "s".repeat(32);
    process.env.PII_ENCRYPTION_KEY = "e".repeat(32);
    process.env.TENANT_CONTEXT_SIGNING_KEY_ID = "test-v1";
    process.env.TENANT_CONTEXT_AUDIENCE = "test:local:database";
    process.env.TENANT_CONTEXT_SIGNING_SECRET =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
    delete process.env.ENCRYPTION_KEY;
    delete process.env.RATE_LIMIT_BACKEND;
    delete process.env.DISABLE_RATE_LIMIT;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterAll(() => {
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("accepts the shared Postgres fallback when Upstash is intentionally unset", () => {
    process.env.RATE_LIMIT_BACKEND = "postgres";
    expect(() => validateSecurityEnvironment()).not.toThrow();
  });

  it("accepts an absent signing tuple only for a local non-production database", () => {
    process.env.NODE_ENV = "development";
    delete process.env.TENANT_CONTEXT_SIGNING_KEY_ID;
    delete process.env.TENANT_CONTEXT_AUDIENCE;
    delete process.env.TENANT_CONTEXT_SIGNING_SECRET;
    expect(() => validateSecurityEnvironment()).not.toThrow();

    process.env.DATABASE_URL =
      "postgresql://runtime:secret@ep-remote-pooler.aws.neon.tech/school_sis";
    expect(() => validateSecurityEnvironment()).toThrow(
      "TENANT_CONTEXT_SIGNING_KEY_ID",
    );
  });

  it("requires an explicit distributed backend in production", () => {
    expect(() => validateSecurityEnvironment()).toThrow(
      "Production requires explicit RATE_LIMIT_BACKEND=redis or RATE_LIMIT_BACKEND=postgres",
    );
  });

  it("accepts Redis only with complete Upstash credentials", () => {
    process.env.RATE_LIMIT_BACKEND = "redis";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    expect(() => validateSecurityEnvironment()).not.toThrow();
  });

  it("rejects a partially configured Upstash backend", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
    expect(() => validateSecurityEnvironment()).toThrow(
      "Upstash rate limiting requires both",
    );
  });

  it("rejects an in-memory primary backend in production", () => {
    process.env.RATE_LIMIT_BACKEND = "memory";
    expect(() => validateSecurityEnvironment()).toThrow(
      "Production requires explicit RATE_LIMIT_BACKEND",
    );
  });

  it("rejects disabling throttling in production", () => {
    process.env.DISABLE_RATE_LIMIT = "true";
    expect(() => validateSecurityEnvironment()).toThrow(
      "DISABLE_RATE_LIMIT=true is not permitted",
    );
  });
});
