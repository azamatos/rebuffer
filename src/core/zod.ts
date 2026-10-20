import { z } from "zod";

// Zod compiles object parsers with `new Function` when it can and probes for that first. The app's CSP has no
// 'unsafe-eval', so the probe only logged a CSP error (Firefox shows it): parse without compiling.
z.config({ jitless: true });

export { z };
