// Shared test setup — must be imported FIRST in every test file.
// Uses a random temp DB so tests are isolated from production data and
// from leftover state from previous test runs.

import { randomBytes } from "node:crypto";

const suffix = randomBytes(4).toString("hex");
process.env.CLAWWORLD_DB = `/tmp/clawworld-test-${suffix}.db`;
process.env.CLAWWORLD_SECRET = `/tmp/clawworld-test-${suffix}-secret.bin`;

import { afterAll } from "bun:test";
import { unlinkSync } from "node:fs";

afterAll(() => {
  try { unlinkSync(process.env.CLAWWORLD_DB!); } catch {}
  try { unlinkSync(process.env.CLAWWORLD_SECRET!); } catch {}
});
