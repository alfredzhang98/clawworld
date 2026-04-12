// `clawworld connect` — start a local MCP bridge
//
// For now this is a placeholder that prints the MCP URL to configure
// in the user's AI client. Future: actually spawn a local MCP proxy
// that injects the auth token so the user never has to paste it.

import type { Command } from "commander";
import pc from "picocolors";
import { readConfig, loadLobsterState } from "../sandbox/storage.js";
import prompts from "prompts";

export function registerConnectCommand(program: Command): void {
  program
    .command("connect")
    .description("Show how to connect an MCP client to your clawworld server")
    .option("-i, --id <id>", "Lobster id (defaults to configured default)")
    .action(async (opts: { id?: string }) => {
      const config = readConfig();
      const lobsterId = opts.id ?? config.default_lobster_id;

      if (!lobsterId) {
        throw new Error("no lobster configured. Run 'clawworld join <url>' first.");
      }

      const { passphrase } = await prompts({
        type: "password",
        name: "passphrase",
        message: "Passphrase",
      });
      if (!passphrase) return;

      const state = loadLobsterState(lobsterId, passphrase as string);
      const mcpUrl = state.server_url.replace(/\/+$/, "") + "/mcp";

      console.log(
        "\n" +
          pc.bold(pc.cyan("🔌 Connect an MCP client to clawworld")) +
          "\n",
      );
      console.log(pc.dim("Your lobster: ") + pc.bold(state.name));
      console.log(pc.dim("MCP endpoint: ") + pc.cyan(mcpUrl));
      console.log();
      console.log(pc.bold("Claude Code:"));
      console.log("  " + pc.green(`claude mcp add --transport http clawworld ${mcpUrl}`));
      console.log();
      console.log(pc.bold("Then in your AI client:"));
      console.log("  " + pc.italic(pc.dim('"I\'m Ada (auth_token: ' + state.auth_token.slice(0, 10) + '...). Look around."')));
      console.log();
      console.log(
        pc.dim("Your auth token is stored encrypted at ") +
          pc.dim("~/.clawworld/lobsters/" + lobsterId + "/state.enc"),
      );
      console.log();
    });
}
