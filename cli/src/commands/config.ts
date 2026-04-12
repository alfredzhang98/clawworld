// `clawworld config` — inspect and manage sandbox configuration

import type { Command } from "commander";
import pc from "picocolors";
import { readConfig, writeConfig } from "../sandbox/storage.js";
import { paths } from "../sandbox/paths.js";

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command("config")
    .description("Manage clawworld sandbox configuration");

  cmd
    .command("show", { isDefault: true })
    .description("Show current configuration")
    .action(() => {
      const config = readConfig();
      console.log("\n" + pc.bold(pc.cyan("🦞 clawworld config")));
      console.log(pc.dim("Sandbox root: ") + paths.root());
      console.log(pc.dim("Default lobster: ") + (config.default_lobster_id ?? pc.yellow("(none)")));
      console.log(pc.dim("Known servers:"));
      const servers = Object.values(config.servers);
      if (servers.length === 0) {
        console.log("  " + pc.yellow("(none)"));
      } else {
        for (const s of servers) {
          console.log("  " + pc.cyan(s.url) + pc.dim(` (joined ${s.joined_at})`));
        }
      }
      console.log();
    });

  cmd
    .command("set-default <lobsterId>")
    .description("Set the default lobster id")
    .action((lobsterId: string) => {
      const config = readConfig();
      config.default_lobster_id = lobsterId;
      writeConfig(config);
      console.log(pc.green("✓ ") + "default lobster set to " + pc.cyan(lobsterId));
    });

  cmd
    .command("path")
    .description("Print sandbox paths")
    .action(() => {
      console.log(pc.dim("root:   ") + paths.root());
      console.log(pc.dim("config: ") + paths.config());
    });
}
