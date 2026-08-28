import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Evaluate the production release's failure-path gates against every reachable
 * combination of step outcomes.
 *
 * Every defect fixed in this area was a gate that said something other than what
 * it appeared to say, and each was found by reading rather than by testing:
 *
 *   - the rollback gated on `promote.outputs.attempted`, written BEFORE
 *     `vercel promote` runs, so it fired for failures that followed a
 *     *successful* promotion and reverted verified-healthy production;
 *   - the cleanup required `rollback.outcome == 'success'`, so it skipped the
 *     one state that leaks a candidate — promotion attempted, rollback failed.
 *
 * Reading a condition is exactly the check that failed. So this asserts on the
 * truth table instead: given a scenario, which steps fire?
 */
const workflow = readFileSync(
  resolve(process.cwd(), "../..", ".github/workflows/deploy-production.yml"),
  "utf8",
);

/** Pull one step's `if:` condition out of the workflow text, folded to one line. */
function gateFor(stepName: string): string {
  const start = workflow.indexOf(`- name: ${stepName}`);
  if (start < 0) throw new Error(`no step named ${stepName}`);
  const nextStep = workflow.indexOf("\n      - name:", start + 1);
  const block = workflow.slice(start, nextStep < 0 ? undefined : nextStep);

  const inline = /^\s*if:\s*(?!>)(\S.*)$/m.exec(block);
  if (inline) return inline[1].trim();

  const folded = block.indexOf("if: >-");
  if (folded < 0) throw new Error(`step ${stepName} has no if:`);
  const lines = block.slice(folded).split("\n").slice(1);
  const out: string[] = [];
  for (const line of lines) {
    if (!/^\s{10}\S/.test(line)) break;
    out.push(line.trim());
  }
  return out.join(" ");
}

interface World {
  jobFailed: boolean;
  steps: Record<
    string,
    { outcome?: string; outputs?: Record<string, string> }
  >;
}

function resolveRef(ref: string, world: World): string {
  const outcome = /^steps\.([A-Za-z0-9_-]+)\.outcome$/.exec(ref);
  if (outcome) return world.steps[outcome[1]]?.outcome ?? "";
  const output = /^steps\.([A-Za-z0-9_-]+)\.outputs\.([A-Za-z0-9_-]+)$/.exec(ref);
  if (output) return world.steps[output[1]]?.outputs?.[output[2]] ?? "";
  throw new Error(`unsupported reference: ${ref}`);
}

/**
 * Deliberately narrow: it understands `&&` chains of comparisons and the two
 * status functions, and THROWS on anything else. A gate that grew an `||` or a
 * parenthesised group would fail this suite loudly rather than be evaluated
 * wrongly and quietly — which is the whole failure mode being guarded against.
 */
function evaluateGate(condition: string, world: World): boolean {
  return condition.split("&&").every((rawTerm) => {
    const term = rawTerm.trim();
    if (term === "always()") return true;
    if (term === "failure()") return world.jobFailed;
    if (term === "success()") return !world.jobFailed;
    const comparison = /^(\S+)\s*(==|!=)\s*'([^']*)'$/.exec(term);
    if (!comparison) throw new Error(`unsupported term: ${term}`);
    const [, ref, operator, literal] = comparison;
    const value = resolveRef(ref, world);
    return operator === "==" ? value === literal : value !== literal;
  });
}

const ROLLBACK = "Roll back Vercel to captured production on promotion failure";
const CLEANUP = "Delete an unpromoted or rolled-back production candidate";
const REPORT = "Report what production is serving";

const world = (
  jobFailed: boolean,
  steps: World["steps"],
  priorId = "dpl_PRIOR",
): World => ({
  jobFailed,
  steps: { prior: { outputs: { prior_id: priorId } }, ...steps },
});

describe("production release failure-path gates", () => {
  const scenarios: Array<{
    name: string;
    world: World;
    rollback: boolean;
    cleanup: boolean;
    why: string;
  }> = [
    {
      name: "healthy release",
      world: world(false, {
        candidate: { outcome: "success" },
        promote: { outcome: "success", outputs: { attempted: "true" } },
        bind: { outcome: "success" },
      }),
      rollback: false,
      cleanup: false,
      why: "nothing failed",
    },
    {
      name: "candidate build failed",
      world: world(true, {
        candidate: { outcome: "failure" },
        promote: { outcome: "skipped", outputs: {} },
        bind: { outcome: "skipped" },
      }),
      rollback: false,
      cleanup: true,
      why: "promotion was never attempted, so nothing to revert but there may be an artifact",
    },
    {
      name: "promotion failed",
      world: world(true, {
        candidate: { outcome: "success" },
        promote: { outcome: "failure", outputs: { attempted: "true" } },
        bind: { outcome: "skipped" },
        rollback: { outcome: "success" },
      }),
      rollback: true,
      cleanup: true,
      why: "production is unproven; revert and clean up",
    },
    {
      name: "promotion failed AND rollback failed",
      world: world(true, {
        candidate: { outcome: "success" },
        promote: { outcome: "failure", outputs: { attempted: "true" } },
        bind: { outcome: "skipped" },
        rollback: { outcome: "failure" },
      }),
      rollback: true,
      cleanup: true,
      why: "the leak: cleanup used to skip here, orphaning the candidate forever",
    },
    {
      name: "promoted, but canonical verification failed",
      world: world(true, {
        candidate: { outcome: "success" },
        promote: { outcome: "success", outputs: { attempted: "true" } },
        bind: { outcome: "skipped" },
      }),
      rollback: true,
      cleanup: true,
      why: "promotion landed but production is not verified healthy",
    },
    {
      name: "bound and verified, then bookkeeping failed",
      world: world(true, {
        candidate: { outcome: "success" },
        promote: { outcome: "success", outputs: { attempted: "true" } },
        bind: { outcome: "success" },
      }),
      rollback: false,
      cleanup: false,
      why: "production is PROVEN good; never revert or delete it for an audit row",
    },
    {
      name: "failed before a rollback target was captured",
      world: world(
        true,
        {
          candidate: { outcome: "success" },
          promote: { outcome: "failure", outputs: { attempted: "true" } },
          bind: { outcome: "skipped" },
        },
        "",
      ),
      rollback: false,
      cleanup: true,
      why: "no captured deployment to roll back to",
    },
  ];

  it.each(scenarios)("$name → $why", ({ world: scenario, rollback, cleanup }) => {
    expect(evaluateGate(gateFor(ROLLBACK), scenario)).toBe(rollback);
    expect(evaluateGate(gateFor(CLEANUP), scenario)).toBe(cleanup);
  });

  it("reports what production is serving in every outcome without exception", () => {
    expect(gateFor(REPORT)).toBe("always()");
    for (const scenario of scenarios) {
      expect(evaluateGate(gateFor(REPORT), scenario.world)).toBe(true);
    }
  });

  it("keeps both recovery gates keyed on the binding step", () => {
    // `bind` succeeding is the only state in which production is proven to be
    // serving this release's candidate. Both gates must agree on that authority,
    // or they can contradict each other about whether production is safe.
    expect(gateFor(ROLLBACK)).toContain("steps.bind.outcome != 'success'");
    expect(gateFor(CLEANUP)).toContain("steps.bind.outcome != 'success'");
  });
});
