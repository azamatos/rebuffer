import { execFileSync } from "node:child_process";

/** Builds the synthetic test stream once (tests/e2e/fixtures/make-stream.mjs); later runs reuse it. */
export default function globalSetup() {
  execFileSync("node", ["tests/e2e/fixtures/make-stream.mjs"], { stdio: "inherit" });
}
