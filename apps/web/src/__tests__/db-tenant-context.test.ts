import type { Pool, PoolClient } from "pg";
import { performance } from "node:perf_hooks";
import {
  getCurrentDbContext,
  createRlsRoutingPool,
  patchPoolForRlsContext,
  registerDbRlsContextResolver,
  RLS_BYPASS_JUSTIFICATIONS,
  runWithRlsBypass,
  runWithTenantContext,
  signTenantContext,
} from "@/lib/db";

const TENANT_ID = "0c413c23-6f0f-40ab-bd41-73e6e996ff35";
const TEST_AUDIENCE = "test:local:db";
const TEST_KEY_ID = "unit-v1";
const TEST_SIGNING_SECRET = "A".repeat(43);

function queryText(query: unknown): unknown {
  return query && typeof query === "object" && "text" in query
    ? (query as { text: unknown }).text
    : query;
}

function rawQueryTexts(mock: jest.Mock): unknown[] {
  return mock.mock.calls.map((call) => queryText(call[0]));
}

function fakePool(
  queryImplementation?: (...args: unknown[]) => Promise<unknown>,
) {
  const implementation =
    queryImplementation || (async () => ({ rows: [] as unknown[] }));
  const contextualImplementation = async (...args: unknown[]) => {
    const text = queryText(args[0]);
    const result = await implementation(text, ...args.slice(1));
    if (text === "DISCARD ALL") {
      return { command: "DISCARD", rows: [] };
    }
    if (text === TENANT_TRANSACTION) {
      return {
        rows: [{ database_epoch_seconds: 1_800_000_000, transaction_id: "42" }],
      };
    }
    if (
      text === TENANT_SET_LOCAL &&
      result &&
      typeof result === "object" &&
      "rows" in result &&
      Array.isArray((result as { rows: unknown[] }).rows) &&
      (result as { rows: unknown[] }).rows.length === 0
    ) {
      const values = args[1] as string[];
      return {
        rows: [{ remaining_seconds: 300, verified_tenant_id: values[0] }],
      };
    }
    return result;
  };
  const rawQuery = jest.fn(contextualImplementation);
  const rawPoolQuery = jest.fn(
    queryImplementation || (async () => ({ rows: [] })),
  );
  const releases: jest.Mock[] = [];
  const client = {
    query: rawQuery,
    release: jest.fn(),
  } as unknown as PoolClient;
  const rawConnect = jest.fn(async () => {
    const release = jest.fn();
    releases.push(release);
    client.release = release as PoolClient["release"];
    return client;
  });
  const rawPool = {
    connect: rawConnect,
    query: rawPoolQuery,
  } as unknown as Pool;
  return {
    pool: patchPoolForRlsContext(rawPool),
    rawConnect,
    rawQuery,
    rawPoolQuery,
    releases,
  };
}

const TENANT_SET_LOCAL =
  "WITH configured AS MATERIALIZED (SELECT set_config('search_path', 'pg_catalog, public', true), set_config('app.current_tenant', $1, true), set_config('app.tenant_context_audience', $2, true), set_config('app.tenant_context_key_id', $3, true), set_config('app.tenant_context_expires_at', $4, true), set_config('app.tenant_context_nonce', $5, true), set_config('app.tenant_context_signature', $6, true), set_config('app.current_owner', '', true), set_config('app.current_group', '', true), set_config('app.bypass_rls', 'off', true)) SELECT app_private.verified_tenant_id()::text AS verified_tenant_id, GREATEST($4::bigint - floor(extract(epoch FROM clock_timestamp()))::bigint, 0)::integer AS remaining_seconds FROM configured";
const TENANT_TRANSACTION =
  "SELECT pg_current_xact_id()::text AS transaction_id, floor(extract(epoch FROM clock_timestamp()))::bigint AS database_epoch_seconds";
const BYPASS_SET_LOCAL =
  "SELECT set_config('search_path', 'pg_catalog, public', true), set_config('app.current_tenant', '', true), set_config('app.tenant_context_audience', '', true), set_config('app.tenant_context_key_id', '', true), set_config('app.tenant_context_expires_at', '', true), set_config('app.tenant_context_nonce', '', true), set_config('app.tenant_context_signature', '', true), set_config('app.current_owner', '', true), set_config('app.current_group', '', true), set_config('app.bypass_rls', 'on', true)";
const NEUTRAL_SET_LOCAL =
  "SELECT set_config('search_path', 'pg_catalog, public', true), set_config('app.current_tenant', '', true), set_config('app.tenant_context_audience', '', true), set_config('app.tenant_context_key_id', '', true), set_config('app.tenant_context_expires_at', '', true), set_config('app.tenant_context_nonce', '', true), set_config('app.tenant_context_signature', '', true), set_config('app.current_owner', '', true), set_config('app.current_group', '', true), set_config('app.bypass_rls', 'off', true)";

function signedTenantParameters() {
  return [
    TENANT_ID,
    TEST_AUDIENCE,
    TEST_KEY_ID,
    expect.stringMatching(/^[0-9]{10}$/),
    expect.stringMatching(/^[0-9a-f]{32}$/),
    expect.stringMatching(/^[0-9a-f]{64}$/),
  ];
}

describe("database tenant context", () => {
  beforeEach(() => {
    process.env.TENANT_CONTEXT_SIGNING_KEY_ID = TEST_KEY_ID;
    process.env.TENANT_CONTEXT_AUDIENCE = TEST_AUDIENCE;
    process.env.TENANT_CONTEXT_SIGNING_SECRET = TEST_SIGNING_SECRET;
  });

  afterEach(() => {
    registerDbRlsContextResolver(undefined);
    delete process.env.TENANT_CONTEXT_SIGNING_KEY_ID;
    delete process.env.TENANT_CONTEXT_AUDIENCE;
    delete process.env.TENANT_CONTEXT_SIGNING_SECRET;
  });

  it("creates a deterministic canonical HMAC without exposing the key", () => {
    expect(
      signTenantContext(
        TENANT_ID.toUpperCase(),
        {
          TENANT_CONTEXT_AUDIENCE: TEST_AUDIENCE,
          TENANT_CONTEXT_SIGNING_KEY_ID: TEST_KEY_ID,
          TENANT_CONTEXT_SIGNING_SECRET: TEST_SIGNING_SECRET,
        },
        {
          nowMs: 1_800_000_000_000,
          nonce: "1".repeat(32),
          transactionId: "42",
        },
      ),
    ).toEqual({
      tenantId: TENANT_ID,
      audience: TEST_AUDIENCE,
      keyId: TEST_KEY_ID,
      transactionId: "42",
      expiresAt: "1800000300",
      nonce: "1".repeat(32),
      signature:
        "0761fcc1f086c9050af5ebcd0be923a5370e73748bfce45ec6cf8779a432aca6",
    });
  });

  it("uses the canonical fallback only for a fully unconfigured local non-production runtime", () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalNodeEnvironment = process.env.NODE_ENV;
    delete process.env.TENANT_CONTEXT_SIGNING_KEY_ID;
    delete process.env.TENANT_CONTEXT_AUDIENCE;
    delete process.env.TENANT_CONTEXT_SIGNING_SECRET;
    process.env.DATABASE_URL =
      "postgresql://postgres@localhost:5433/school_sis?sslmode=disable";
    process.env.NODE_ENV = "development";
    try {
      const signed = signTenantContext(TENANT_ID, undefined, {
        nowMs: 1_800_000_000_000,
        nonce: "3".repeat(32),
        transactionId: "42",
      });
      expect(signed.keyId).toBe("local-ci-v1");
      expect(signed.audience).toBe("ci:local:database");
      expect(signed.signature).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnvironment;
    }
  });

  it("does not supply the local signing fallback to a remote non-production runtime", () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalNodeEnvironment = process.env.NODE_ENV;
    delete process.env.TENANT_CONTEXT_SIGNING_KEY_ID;
    delete process.env.TENANT_CONTEXT_AUDIENCE;
    delete process.env.TENANT_CONTEXT_SIGNING_SECRET;
    process.env.DATABASE_URL =
      "postgresql://runtime:secret@ep-remote-pooler.aws.neon.tech/school_sis";
    process.env.NODE_ENV = "development";
    try {
      expect(() =>
        signTenantContext(TENANT_ID, undefined, {
          nowMs: 1_800_000_000_000,
          nonce: "4".repeat(32),
          transactionId: "42",
        }),
      ).toThrow("TENANT_CONTEXT_SIGNING_KEY_ID");

      process.env.DATABASE_URL =
        "postgresql://postgres@localhost:5433/school_sis?sslmode=disable&HOST=remote.example";
      expect(() =>
        signTenantContext(TENANT_ID, undefined, {
          nowMs: 1_800_000_000_000,
          nonce: "5".repeat(32),
          transactionId: "42",
        }),
      ).toThrow("TENANT_CONTEXT_SIGNING_KEY_ID");
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnvironment;
    }
  });

  it("binds an otherwise identical signature to one deployment audience", () => {
    const options = {
      nowMs: 1_800_000_000_000,
      nonce: "2".repeat(32),
      transactionId: "42",
    };
    const production = signTenantContext(
      TENANT_ID,
      {
        TENANT_CONTEXT_AUDIENCE: "production:project:branch",
        TENANT_CONTEXT_SIGNING_KEY_ID: TEST_KEY_ID,
        TENANT_CONTEXT_SIGNING_SECRET: TEST_SIGNING_SECRET,
      },
      options,
    );
    const preview = signTenantContext(
      TENANT_ID,
      {
        TENANT_CONTEXT_AUDIENCE: "preview:project:branch",
        TENANT_CONTEXT_SIGNING_KEY_ID: TEST_KEY_ID,
        TENANT_CONTEXT_SIGNING_SECRET: TEST_SIGNING_SECRET,
      },
      options,
    );
    expect(preview.signature).not.toBe(production.signature);
  });

  it("scopes async work to the active tenant and restores the outer context", async () => {
    expect(getCurrentDbContext()).toBeUndefined();

    await runWithTenantContext(TENANT_ID, async () => {
      expect(getCurrentDbContext()).toEqual({ tenantId: TENANT_ID });

      await runWithRlsBypass(
        RLS_BYPASS_JUSTIFICATIONS.TEST_CONTEXT_NESTING,
        async () => {
          expect(getCurrentDbContext()).toEqual({
            bypassRls: true,
            justification: RLS_BYPASS_JUSTIFICATIONS.TEST_CONTEXT_NESTING,
          });
        },
      );

      expect(getCurrentDbContext()).toEqual({ tenantId: TENANT_ID });
    });

    expect(getCurrentDbContext()).toBeUndefined();
  });

  it("rejects invalid tenant and unreviewed bypass contexts before querying", async () => {
    await expect(
      runWithTenantContext("not-a-uuid", async () => "unreachable"),
    ).rejects.toThrow("Invalid tenant context");
    const unreviewed = { id: "test.unreviewed", reason: "not registered" };
    await expect(
      runWithRlsBypass(unreviewed as never, async () => "unreachable"),
    ).rejects.toThrow("RLS bypass requires a reviewed justification");
  });

  it("uses SET LOCAL inside an explicit tenant transaction", async () => {
    const { pool, rawQuery, releases } = fakePool(async (query) =>
      query === "SELECT id FROM students"
        ? { rows: [{ id: "student-1" }] }
        : { rows: [] },
    );

    await runWithTenantContext(TENANT_ID, async () => {
      const client = await pool.connect();
      await client.query("BEGIN");
      await expect(client.query("SELECT id FROM students")).resolves.toEqual({
        rows: [{ id: "student-1" }],
      });
      await client.query("COMMIT");
      client.release();
    });

    expect(rawQuery.mock.calls).toEqual([
      ["DISCARD ALL"],
      ["BEGIN"],
      [TENANT_TRANSACTION],
      [TENANT_SET_LOCAL, signedTenantParameters()],
      [{ text: "SELECT id FROM students", queryMode: "extended" }],
      ["COMMIT"],
      ["DISCARD ALL"],
    ]);
    expect(releases[0]).toHaveBeenCalledWith(undefined);
  });

  it("wraps each standalone protected query in its own pooler-safe transaction", async () => {
    const { pool, rawQuery, releases } = fakePool(async (query) =>
      query === "SELECT id FROM students"
        ? { rows: [{ id: "student-1" }] }
        : { rows: [] },
    );
    const query = {
      name: "tenant-students",
      text: "SELECT id FROM students",
      values: [],
    };

    await runWithTenantContext(TENANT_ID, async () => {
      await expect(pool.query(query)).resolves.toEqual({
        rows: [{ id: "student-1" }],
      });
      await pool.query("SELECT count(*) FROM students");
    });

    expect(rawQuery.mock.calls).toEqual([
      ["DISCARD ALL"],
      ["BEGIN"],
      [TENANT_TRANSACTION],
      [TENANT_SET_LOCAL, signedTenantParameters()],
      [{ ...query, queryMode: "extended" }],
      ["COMMIT"],
      ["DISCARD ALL"],
      ["BEGIN"],
      [TENANT_TRANSACTION],
      [TENANT_SET_LOCAL, signedTenantParameters()],
      [{ text: "SELECT count(*) FROM students", queryMode: "extended" }],
      ["COMMIT"],
      ["DISCARD ALL"],
    ]);
    expect(releases).toHaveLength(2);
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(
      true,
    );
  });

  it("uses a reviewed bypass only within the same transaction as the query", async () => {
    const { pool, rawQuery } = fakePool();

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TEST_CONTEXT_NESTING, () =>
      pool.query("SELECT count(*) FROM tenants"),
    );

    expect(rawQuery.mock.calls).toEqual([
      ["DISCARD ALL"],
      ["BEGIN"],
      [BYPASS_SET_LOCAL],
      [{ text: "SELECT count(*) FROM tenants", queryMode: "extended" }],
      ["COMMIT"],
      ["DISCARD ALL"],
    ]);
  });

  it("routes tenant and unscoped work away from the dedicated platform pool", async () => {
    const tenant = fakePool();
    const platform = fakePool();
    const routed = createRlsRoutingPool(tenant.pool, platform.pool);

    await routed.query("SELECT ordinary");
    await runWithTenantContext(TENANT_ID, () => routed.query("SELECT tenant"));

    expect(tenant.rawPoolQuery).not.toHaveBeenCalled();
    expect(rawQueryTexts(tenant.rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      NEUTRAL_SET_LOCAL,
      "SELECT ordinary",
      "COMMIT",
      "DISCARD ALL",
      "BEGIN",
      TENANT_TRANSACTION,
      TENANT_SET_LOCAL,
      "SELECT tenant",
      "COMMIT",
      "DISCARD ALL",
    ]);
    expect(platform.rawQuery).not.toHaveBeenCalled();
  });

  it("routes only branded bypass work through the dedicated platform pool", async () => {
    const tenant = fakePool();
    const platform = fakePool();
    const routed = createRlsRoutingPool(tenant.pool, platform.pool);

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TEST_CONTEXT_NESTING, () =>
      routed.query("SELECT platform"),
    );

    expect(tenant.rawQuery).not.toHaveBeenCalled();
    expect(rawQueryTexts(platform.rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      BYPASS_SET_LOCAL,
      "SELECT platform",
      "COMMIT",
      "DISCARD ALL",
    ]);
  });

  it("rolls back a failed standalone query before releasing the client", async () => {
    const queryError = new Error("business query failed");
    const { pool, rawQuery, releases } = fakePool(async (query) => {
      if (query === "SELECT broken") throw queryError;
      return { rows: [] };
    });

    await expect(
      runWithTenantContext(TENANT_ID, () => pool.query("SELECT broken")),
    ).rejects.toBe(queryError);
    expect(rawQueryTexts(rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      TENANT_TRANSACTION,
      TENANT_SET_LOCAL,
      "SELECT broken",
      "ROLLBACK",
      "DISCARD ALL",
    ]);
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it("rolls back when SET LOCAL fails without leaking the checkout", async () => {
    const contextError = new Error("set_config failed");
    const { pool, rawQuery, releases } = fakePool(async (query) => {
      if (query === TENANT_SET_LOCAL) throw contextError;
      return { rows: [] };
    });

    await expect(
      runWithTenantContext(TENANT_ID, () => pool.query("SELECT protected")),
    ).rejects.toBe(contextError);
    expect(rawQueryTexts(rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      TENANT_TRANSACTION,
      TENANT_SET_LOCAL,
      "ROLLBACK",
      "DISCARD ALL",
    ]);
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it("rolls back after an explicit BEGIN returns an ambiguous error", async () => {
    const beginError = new Error("begin response lost");
    let beginCalls = 0;
    const { pool, rawQuery, releases } = fakePool(async (query) => {
      if (query === "BEGIN" && beginCalls++ === 0) throw beginError;
      return { rows: [] };
    });
    const client = await pool.connect();

    await expect(client.query("BEGIN")).rejects.toBe(beginError);
    client.release();

    expect(rawQueryTexts(rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      "ROLLBACK",
      "DISCARD ALL",
    ]);
    expect(releases[0]).toHaveBeenCalledWith(undefined);
  });

  it("rolls back after an automatic BEGIN returns an ambiguous error", async () => {
    const beginError = new Error("begin response lost");
    let beginCalls = 0;
    const { pool, rawQuery, releases } = fakePool(async (query) => {
      if (query === "BEGIN" && beginCalls++ === 0) throw beginError;
      return { rows: [] };
    });

    await expect(pool.query("SELECT protected")).rejects.toBe(beginError);

    expect(rawQueryTexts(rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      "ROLLBACK",
      "DISCARD ALL",
    ]);
    expect(releases[0]).toHaveBeenCalledWith(undefined);
  });

  it("destroys the checkout after an ambiguous commit failure", async () => {
    const commitError = new Error("commit failed");
    const { pool, rawQuery, releases } = fakePool(async (query) => {
      if (query === "COMMIT") throw commitError;
      return query === "SELECT protected"
        ? { rows: [{ ok: true }] }
        : { rows: [] };
    });

    await expect(
      runWithTenantContext(TENANT_ID, () => pool.query("SELECT protected")),
    ).rejects.toBe(commitError);
    expect(rawQueryTexts(rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      TENANT_TRANSACTION,
      TENANT_SET_LOCAL,
      "SELECT protected",
      "COMMIT",
      "ROLLBACK",
      "DISCARD ALL",
    ]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(releases[0]).toHaveBeenCalledWith(commitError);
  });

  it("preserves an explicit COMMIT result when post-commit scrub fails", async () => {
    const scrubError = new Error("post-commit discard failed");
    let discardCalls = 0;
    const { pool, rawQuery, releases } = fakePool(async (query) => {
      if (query === "DISCARD ALL" && ++discardCalls === 2) throw scrubError;
      if (query === "COMMIT") return { command: "COMMIT", rows: [] };
      return { rows: [] };
    });
    const client = await pool.connect();

    await client.query("BEGIN");
    await client.query("SELECT protected");
    await expect(client.query("COMMIT")).resolves.toEqual({
      command: "COMMIT",
      rows: [],
    });
    await expect(client.query("SELECT unsafe_retry")).rejects.toThrow(
      /client is quarantined/,
    );
    client.release();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(rawQueryTexts(rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      NEUTRAL_SET_LOCAL,
      "SELECT protected",
      "COMMIT",
      "DISCARD ALL",
      "DISCARD ALL",
    ]);
    expect(releases[0]).toHaveBeenCalledWith(scrubError);
  });

  it("preserves an automatic query result when post-commit scrub fails", async () => {
    const scrubError = new Error("post-commit discard failed");
    let discardCalls = 0;
    const { pool, rawQuery, releases } = fakePool(async (query) => {
      if (query === "DISCARD ALL" && ++discardCalls === 2) throw scrubError;
      if (query === "SELECT mutation") return { rows: [{ updated: 1 }] };
      return { rows: [] };
    });

    await expect(pool.query("SELECT mutation")).resolves.toEqual({
      rows: [{ updated: 1 }],
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(rawQueryTexts(rawQuery)).toEqual([
      "DISCARD ALL",
      "BEGIN",
      NEUTRAL_SET_LOCAL,
      "SELECT mutation",
      "COMMIT",
      "DISCARD ALL",
      "DISCARD ALL",
    ]);
    expect(releases[0]).toHaveBeenCalledWith(scrubError);
  });

  it("rolls back a forgotten explicit transaction before returning the client", async () => {
    const { pool, rawQuery, releases } = fakePool();

    await runWithTenantContext(TENANT_ID, async () => {
      const client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT id FROM students");
      client.release();
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(rawQueryTexts(rawQuery)).toEqual(
      expect.arrayContaining(["ROLLBACK", "DISCARD ALL"]),
    );
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it("resolves tenant context at query time after an async authentication boundary", async () => {
    const { pool, rawQuery } = fakePool(async (query) =>
      query === "SELECT id FROM students"
        ? { rows: [{ id: "student-1" }] }
        : { rows: [] },
    );
    registerDbRlsContextResolver(async () => {
      await Promise.resolve();
      return { tenantId: TENANT_ID };
    });

    await Promise.resolve();
    await expect(pool.query("SELECT id FROM students")).resolves.toEqual({
      rows: [{ id: "student-1" }],
    });
    expect(rawQuery.mock.calls[3]).toEqual([
      TENANT_SET_LOCAL,
      signedTenantParameters(),
    ]);
  });

  it("does not check out a client when the request context resolver rejects", async () => {
    const { pool, rawConnect } = fakePool();
    const resolverError = new Error("request context unavailable");
    registerDbRlsContextResolver(async () => {
      throw resolverError;
    });

    await expect(pool.connect()).rejects.toBe(resolverError);
    expect(rawConnect).not.toHaveBeenCalled();
  });

  it("rejects a context change during an explicit transaction", async () => {
    const secondTenant = "00000000-0000-4000-8000-000000000099";
    let resolvedTenant = TENANT_ID;
    registerDbRlsContextResolver(() => ({ tenantId: resolvedTenant }));
    const { pool, rawQuery, releases } = fakePool();
    const client = await pool.connect();

    await client.query("BEGIN");
    resolvedTenant = secondTenant;
    await expect(client.query("SELECT protected")).rejects.toThrow(
      /context changed/,
    );
    client.release();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(rawQuery.mock.calls.at(-2)?.[0]).toBe("ROLLBACK");
    expect(rawQuery.mock.calls.at(-1)?.[0]).toBe("DISCARD ALL");
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it("commits before invoking a pool.query callback", async () => {
    const { pool, rawQuery } = fakePool(async (query) =>
      query === "SELECT callback_result"
        ? { rows: [{ ok: true }] }
        : { rows: [] },
    );

    await runWithTenantContext(
      TENANT_ID,
      () =>
        new Promise<void>((resolve, reject) => {
          pool.query("SELECT callback_result", (error, result) => {
            if (error) return reject(error);
            expect(result.rows).toEqual([{ ok: true }]);
            expect(rawQuery.mock.calls.at(-2)?.[0]).toBe("COMMIT");
            expect(rawQuery.mock.calls.at(-1)?.[0]).toBe("DISCARD ALL");
            resolve();
          });
        }),
    );
  });

  it("rejects embedded statements while allowing semicolons inside literals", async () => {
    const { pool, rawQuery } = fakePool(async (query) =>
      query === "SELECT ';'::text" ? { rows: [{ value: ";" }] } : { rows: [] },
    );

    await expect(pool.query("SELECT 1; COMMIT")).rejects.toThrow(
      /Multi-statement database queries are not supported/,
    );
    await expect(
      pool.query("/* transaction */ PREPARE TRANSACTION 'gid'"),
    ).rejects.toThrow(/Unsupported or multi-statement transaction control/);
    await expect(pool.query("PREPARE/**/TRANSACTION 'gid'")).rejects.toThrow(
      /Unsupported or multi-statement transaction control/,
    );
    const dollarIdentifierExploit =
      "SELECT 1 AS foo$tag$; COMMIT; SELECT 2 AS exploited; --$tag$";
    await expect(pool.query(dollarIdentifierExploit)).rejects.toThrow(
      /Multi-statement database queries are not supported/,
    );
    await expect(pool.query("SELECT $tag$one;two$tag$::text")).resolves.toEqual(
      {
        rows: [],
      },
    );
    await expect(
      pool.query("SELECT foo$tag$ FROM identifiers"),
    ).resolves.toEqual({
      rows: [],
    });
    await expect(pool.query("SELECT ';'::text")).resolves.toEqual({
      rows: [{ value: ";" }],
    });
    expect(
      rawQuery.mock.calls.some(
        (call) => queryText(call[0]) === "SELECT 1; COMMIT",
      ),
    ).toBe(false);
    expect(
      rawQuery.mock.calls.some(
        (call) => queryText(call[0]) === dollarIdentifierExploit,
      ),
    ).toBe(false);
    expect(
      rawQuery.mock.calls.find(
        (call) => queryText(call[0]) === "SELECT $tag$one;two$tag$::text",
      )?.[0],
    ).toEqual({
      text: "SELECT $tag$one;two$tag$::text",
      queryMode: "extended",
    });
  });

  it.each([
    ["/* leading */ COMMIT", "COMMIT"],
    ["-- leading\nROLLBACK", "ROLLBACK"],
    ["/* nested /* comment */ ok */ ABORT", "ABORT"],
  ])(
    "classifies comment-prefixed transaction control without desynchronizing state: %s",
    async (control, expectedRawControl) => {
      const { pool, rawQuery } = fakePool();
      const client = await pool.connect();
      await client.query("BEGIN");
      await client.query(control);
      await client.query("SELECT after_control");
      client.release();

      expect(
        rawQuery.mock.calls.filter((call) => call[0] === "BEGIN"),
      ).toHaveLength(2);
      expect(rawQuery.mock.calls.some((call) => call[0] === control)).toBe(
        true,
      );
      expect(expectedRawControl).toMatch(/^(?:ABORT|COMMIT|ROLLBACK)$/u);
    },
  );

  it("serializes immediately concurrent operations on one checked-out client", async () => {
    let unblockResolver: (() => void) | undefined;
    const resolverBarrier = new Promise<void>((resolve) => {
      unblockResolver = resolve;
    });
    let resolverCalls = 0;
    const { pool, rawQuery } = fakePool();
    const client = await pool.connect();
    registerDbRlsContextResolver(async () => {
      resolverCalls += 1;
      if (resolverCalls === 1) await resolverBarrier;
      return { tenantId: TENANT_ID };
    });

    const firstBegin = client.query("BEGIN");
    const concurrentBegin = client.query("BEGIN");
    await Promise.resolve();
    expect(
      rawQuery.mock.calls.filter((call) => call[0] === "BEGIN"),
    ).toHaveLength(0);
    unblockResolver?.();
    await expect(firstBegin).resolves.toEqual({ rows: [] });
    await expect(concurrentBegin).rejects.toThrow(
      /Nested database transactions are not supported/,
    );
    expect(
      rawQuery.mock.calls.filter((call) => call[0] === "BEGIN"),
    ).toHaveLength(1);
    await client.query("ROLLBACK");
    client.release();
  });

  it("always destroys and releases a checkout when release-time scrub fails", async () => {
    const scrubError = new Error("discard failed");
    let discardCalls = 0;
    const { pool, releases } = fakePool(async (query) => {
      if (query === "DISCARD ALL") {
        discardCalls += 1;
        if (discardCalls === 2) throw scrubError;
      }
      return { rows: [] };
    });
    const client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT protected");
    client.release();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(releases[0]).toHaveBeenCalledWith(scrubError);
  });

  it("schedules refresh from a monotonic deadline despite wall-clock jumps", async () => {
    const monotonic = jest.spyOn(performance, "now");
    monotonic.mockReturnValue(1_000);
    const dateNow = jest.spyOn(Date, "now");
    dateNow.mockReturnValue(1_800_000_000_000);
    const { pool, rawQuery } = fakePool();
    const client = await pool.connect();

    await runWithTenantContext(TENANT_ID, async () => {
      await client.query("BEGIN");
      dateNow.mockReturnValue(9_000_000_000_000);
      monotonic.mockReturnValue(200_000);
      await client.query("SELECT before_refresh");
      expect(
        rawQuery.mock.calls.filter((call) => call[0] === TENANT_TRANSACTION),
      ).toHaveLength(1);

      monotonic.mockReturnValue(242_000);
      await client.query("SELECT after_refresh");
      expect(
        rawQuery.mock.calls.filter((call) => call[0] === TENANT_TRANSACTION),
      ).toHaveLength(2);
      await client.query("ROLLBACK");
    });
    client.release();
    monotonic.mockRestore();
    dateNow.mockRestore();
  });
});
