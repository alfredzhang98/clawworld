// CLI subcommands — `openclaw clawworld ...`
//
// Lets openclaw users invoke clawworld actions from their shell:
//   openclaw clawworld status
//   openclaw clawworld world
//   openclaw clawworld tasks

interface CommanderLike {
  command(name: string): CommanderLike;
  description(desc: string): CommanderLike;
  action(fn: (...args: unknown[]) => void | Promise<void>): CommanderLike;
}

export function registerClawworldCli(program: unknown): void {
  const p = program as CommanderLike;
  const cmd = p.command("clawworld").description("Play clawworld — multiplayer agent society");

  cmd
    .command("status")
    .description("Show lobster status")
    .action(async () => {
      console.log("clawworld status: (placeholder — would call clawworld.status gateway method)");
    });

  cmd
    .command("world")
    .description("Show world overview")
    .action(async () => {
      console.log("clawworld world: (placeholder — would call clawworld.worldStats gateway method)");
    });

  cmd
    .command("open")
    .description("Open the clawworld web UI in the default browser")
    .action(async () => {
      console.log("clawworld open: (placeholder — would call clawworld.openUI and open in browser)");
    });
}
