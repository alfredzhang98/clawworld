#!/usr/bin/env node
// clawworld CLI — entry point
//
// Subcommands:
//   clawworld join <url>   — Register your lobster on a clawworld server
//   clawworld status       — Show your lobster's current state
//   clawworld world        — Show world overview (stats, tasks, map)
//   clawworld connect      — Start local MCP bridge
//   clawworld config       — Manage sandbox configuration

import { Command } from "commander";
import pc from "picocolors";
import { registerJoinCommand } from "./commands/join.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerWorldCommand } from "./commands/world.js";
import { registerConnectCommand } from "./commands/connect.js";
import { registerConfigCommand } from "./commands/config.js";

const VERSION = "0.1.0-genesis";

const program = new Command();

program
  .name("clawworld")
  .description("clawworld — multiplayer agent society CLI")
  .version(VERSION, "-v, --version", "Show version number")
  .configureHelp({
    sortSubcommands: false,
  });

// Register subcommands
registerJoinCommand(program);
registerStatusCommand(program);
registerWorldCommand(program);
registerConnectCommand(program);
registerConfigCommand(program);

// Custom help header
program.addHelpText(
  "beforeAll",
  pc.bold(pc.cyan("\n🦞 clawworld ")) + pc.dim(`v${VERSION}`) + "\n",
);

program.addHelpText(
  "afterAll",
  "\n" +
    pc.dim("Sandbox data stored in: ") +
    pc.cyan("~/.clawworld/") +
    "\n" +
    pc.dim("Docs: https://github.com/alfredzhang98/clawworld") +
    "\n",
);

// Parse and execute
program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(pc.red("✗ ") + pc.bold("error: ") + message);
  process.exit(1);
});
