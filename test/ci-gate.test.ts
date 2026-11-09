// The release gate's order, checked on the workflow file itself: every gate
// runs before "Publish to release", none may be skipped past on failure, and
// publish runs only on a push to main. A step that fails stops the job, so a
// build that fails any gate is never published and the previous release
// stays live.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

/** Each step's text, in order, named by its `name:` or its `run:`. */
function steps(): { name: string; body: string }[] {
  return workflow
    .split(/\n(?=      - )/)
    .slice(1)
    .map((body) => ({ name: (/(?:name|run|uses): (.+)/.exec(body)?.[1] ?? "").trim(), body }));
}

const index = (name: string) => steps().findIndex((s) => s.name === name);

describe("the CI release gate", () => {
  it("runs every gate before publishing", () => {
    const publish = index("Publish to release");
    expect(publish).toBeGreaterThan(0);
    for (const gate of ["npm run typecheck", "npm test", "npm run build", "RAM budget", "Smoke test"]) {
      expect(index(gate), gate).toBeGreaterThanOrEqual(0);
      expect(index(gate), gate).toBeLessThan(publish);
    }
  });

  it("runs the smoke test on the build it is about to publish", () => {
    const smoke = steps()[index("Smoke test")]!;
    expect(smoke.body).toMatch(/npm run smoke -- --build build/);
  });

  it("never runs a scenario test or the dev loop (spec #41: local only)", () => {
    expect(workflow).not.toMatch(/npm run (scenario|dev)\b|tools\/(scenario|dev)\.ts/);
  });

  it("lets no step carry on past a failure, and publishes only pushes to main", () => {
    expect(workflow).not.toMatch(/continue-on-error/);
    const publish = steps()[index("Publish to release")]!;
    expect(publish.body).toMatch(/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    expect(publish.body).not.toMatch(/always\(\)|failure\(\)/);
  });
});
