import { execFileSync } from "node:child_process";

/** Builds the 2-minute synthetic stream once (tests/e2e/fixtures/make-stream.mjs --repeat); later runs reuse it. */
export default function globalSetup() {
  execFileSync("node", ["tests/e2e/fixtures/make-stream.mjs", "--repeat"], { stdio: "inherit" });
}
