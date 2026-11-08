// The push watcher's rules (seam F, the pure half): which built files go
// into the game, and what the dev build is called.
import { describe, expect, it } from "vitest";
import { devSource, pushPlan } from "./push.ts";
import { localRelease } from "./release.ts";

const bytes = (s: string) => new TextEncoder().encode(s);
const build = (files: Record<string, string>) => new Map(Object.entries(files).map(([k, v]) => [k, bytes(v)]));

describe("pushPlan", () => {
  it("pushes every file and the manifest into a game it hasn't pushed to", () => {
    const files = build({ "boot.js": "b", "sr/conductor.js": "c" });
    const release = localRelease(files, "src1");
    const plan = pushPlan(null, files, release.manifest);
    expect(plan.files.map((f) => f.filename)).toEqual(["boot.js", "sr/conductor.js", "manifest.json"]);
    expect(JSON.parse(plan.files.at(-1)!.content)).toEqual(release.manifest);
  });

  it("after a rebuild pushes only the changed and new files, and the manifest when the build changed", () => {
    const first = build({ "boot.js": "b", "sr/conductor.js": "c", "sr/h/x.js": "x" });
    const pushed = pushPlan(null, first, localRelease(first, "s").manifest).pushed;
    const second = build({ "boot.js": "b", "sr/conductor.js": "c2", "sr/h/y.js": "y" });
    const plan = pushPlan(pushed, second, localRelease(second, "s").manifest);
    expect(plan.files.map((f) => f.filename)).toEqual(["sr/conductor.js", "sr/h/y.js", "manifest.json"]);
    expect(plan.files[0]!.content).toBe("c2");
    expect(pushPlan(plan.pushed, second, localRelease(second, "s").manifest).files).toEqual([]);
  });
});

describe("devSource", () => {
  it("is the commit for a clean tree, as a release's source is", () => {
    expect(devSource("abc123", false, "f".repeat(40))).toBe("abc123");
  });

  it("names a dirty tree's build by its files, so each edit is a build of its own", () => {
    expect(devSource("abc123", true, "0123456789abcdef")).toBe("abc123-dirty-01234567");
  });
});
