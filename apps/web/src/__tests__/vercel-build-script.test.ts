import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const unixTest = process.platform === "win32" ? it.skip : it;

function runWrapper(target: "preview" | "production"): string[][] {
  const directory = mkdtempSync(join(tmpdir(), "school-sis-vercel-build-"));
  const captureFile = join(directory, "calls.jsonl");
  const fakePnpm = join(directory, "pnpm");
  writeFileSync(
    fakePnpm,
    `#!/usr/bin/env node
require("node:fs").appendFileSync(
  process.env.CAPTURE_FILE,
  JSON.stringify(process.argv.slice(2)) + "\\n",
);
`,
    { mode: 0o755 },
  );
  chmodSync(fakePnpm, 0o755);

  try {
    const result = spawnSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/vercel-build.mjs")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          CAPTURE_FILE: captureFile,
          PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
          VERCEL_TARGET_ENV: target,
        },
      },
    );
    expect(result.status).toBe(0);
    return readFileSync(captureFile, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Vercel build wrapper", () => {
  unixTest(
    "passes preview options without a literal separator argument",
    () => {
      expect(runWrapper("preview")).toEqual([
        ["run", "deployment:check", "--target", "preview"],
        ["run", "build"],
        ["run", "db:migrate:deploy", "--target", "preview"],
      ]);
    },
  );

  unixTest(
    "keeps production runtime-only and free of database mutation",
    () => {
      expect(runWrapper("production")).toEqual([
        ["run", "deployment:check", "--target", "production", "--runtime-only"],
        ["run", "build"],
      ]);
    },
  );
});
