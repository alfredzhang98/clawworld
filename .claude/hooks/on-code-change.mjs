#!/usr/bin/env node
// PostToolUse hook — fires after Edit/Write/MultiEdit tool calls.
//
// Reads the hook payload from stdin (Claude Code passes JSON with
// tool_name, tool_input, etc.), decides whether the changed file
// warrants a fast sanity check, and runs it in the background.
//
// To keep Claude's loop fast, we:
//   - Only trigger on server/src/**.ts or web/src/**.{js,jsx} changes
//   - Run typecheck / vite build in detached processes with a short
//     timeout so the hook returns in <50ms
//   - Log results to .claude/hooks/last-check.log for human review
//
// This is a "check after the fact" pattern — we don't block Claude's
// tool call, we just kick off a background verification that the
// human (or a future Claude turn) can read.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = join(__dirname, "last-check.log");
const ROOT = join(__dirname, "..", "..");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, line);
  } catch {}
}

// Read stdin payload from Claude Code
let payload = {};
try {
  const raw = readFileSync(0, "utf8");
  payload = JSON.parse(raw || "{}");
} catch (e) {
  // No payload — exit quietly. Claude Code still supports hooks without stdin.
  process.exit(0);
}

const input = payload.tool_input || {};
const filePath = input.file_path || input.path || "";

if (!filePath) {
  process.exit(0);
}

// Normalize path for matching
const rel = filePath.replace(/\\/g, "/");

const touchesServer = /\/server\/src\/.+\.ts$/.test(rel);
const touchesWeb = /\/web\/src\/.+\.(js|jsx|ts|tsx)$/.test(rel);
const touchesServerTest = /\/server\/src\/__tests__\/.+\.ts$/.test(rel);

if (!touchesServer && !touchesWeb) {
  process.exit(0);
}

log(`tool=${payload.tool_name} file=${rel}`);

// Fire-and-forget: run the check in a detached process, ignore its
// output from this hook's POV. Write result to the log when it finishes.
function runDetached(cmd, args, cwd, label) {
  log(`starting ${label}: ${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d.toString()));
  child.stderr.on("data", (d) => (out += d.toString()));
  child.on("close", (code) => {
    if (code === 0) {
      log(`${label} OK`);
    } else {
      log(`${label} FAILED (exit ${code}):\n${out.slice(-2000)}`);
    }
  });
  child.on("error", (err) => {
    log(`${label} error: ${err.message}`);
  });
  child.unref();
}

if (touchesServer) {
  runDetached(
    "npx",
    ["--yes", "tsc", "--noEmit"],
    join(ROOT, "server"),
    "server tsc",
  );
  if (touchesServerTest) {
    // Run only the matching test file if possible — else all tests
    // (bun test discovers everything automatically if available)
    runDetached("bun", ["test"], join(ROOT, "server"), "server bun test");
  }
}

if (touchesWeb) {
  runDetached(
    "npx",
    ["--yes", "vite", "build"],
    join(ROOT, "web"),
    "web vite build",
  );
}

// Always exit 0 quickly so Claude's loop isn't blocked
process.exit(0);
