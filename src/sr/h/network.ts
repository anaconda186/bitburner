// Probe `network`: every server reachable from home, home included. The
// conductor checks root and free RAM live on each, so it doesn't pay for
// `scan` itself. Value: ProbeValues["network"] in `../helpers.ts`.
import type { NS } from "@ns";
import { serve } from "./serve.ts";

export async function main(ns: NS): Promise<void> {
  await serve(ns, () => {
    const seen = new Set<string>(["home"]);
    const queue = ["home"];
    for (let host = queue.shift(); host !== undefined; host = queue.shift()) {
      for (const next of ns.scan(host)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return { hosts: [...seen] };
  });
}
