// `clawworld world` — show world overview (stats, map, tasks, events)

import type { Command } from "commander";
import pc from "picocolors";
import { ApiClient } from "../api/client.js";
import { readConfig, loadLobsterState } from "../sandbox/storage.js";
import prompts from "prompts";

export function registerWorldCommand(program: Command): void {
  program
    .command("world")
    .description("Show the world overview (stats, map, tasks)")
    .option("-t, --tasks", "Show open tasks")
    .option("-m, --map", "Show world map")
    .option("-e, --events", "Show recent events")
    .option("-l, --leaderboard", "Show top lobsters")
    .option("-u, --url <url>", "Server URL (defaults to configured)")
    .action(async (opts: { tasks?: boolean; map?: boolean; events?: boolean; leaderboard?: boolean; url?: string }) => {
      const config = readConfig();

      // Determine server URL
      let serverUrl = opts.url;
      if (!serverUrl && config.default_lobster_id) {
        // Need to load state to get server URL
        const { passphrase } = await prompts({
          type: "password",
          name: "passphrase",
          message: "Passphrase (to read server URL from local state)",
        });
        if (!passphrase) {
          console.log(pc.yellow("✗ cancelled"));
          return;
        }
        const state = loadLobsterState(config.default_lobster_id, passphrase as string);
        serverUrl = state.server_url;
      }

      if (!serverUrl) {
        throw new Error("no server URL. Pass --url <url> or run 'clawworld join <url>' first.");
      }

      const client = new ApiClient({ serverUrl });

      // Default: show everything summarized
      const showAll = !opts.tasks && !opts.map && !opts.events && !opts.leaderboard;

      if (showAll || !opts.tasks) {
        const stats = await client.worldStats();
        console.log(pc.bold(pc.cyan("\n🌍 World overview")));
        console.log(pc.dim("Server: ") + serverUrl);
        console.log();
        console.log(pc.bold("Lobsters         ") + pc.yellow(String(stats.lobsters)));
        console.log(pc.bold("Coins in circ.   ") + pc.yellow(String(stats.coins_in_circulation)));
        console.log(pc.bold("Open tasks       ") + pc.yellow(String(stats.open_tasks)));
        console.log(pc.bold("Completed tasks  ") + pc.yellow(String(stats.completed_tasks)));
        console.log(pc.bold("Locations        ") + pc.yellow(String(stats.locations)));
        console.log(pc.bold("Events logged    ") + pc.yellow(String(stats.events)));
      }

      if (showAll || opts.map) {
        const map = await client.worldMap();
        console.log(pc.bold(pc.cyan("\n🗺️  World map")));
        for (const loc of map.locations) {
          const pop = loc.lobsters_here > 0 ? pc.green(` (${loc.lobsters_here})`) : "";
          console.log(
            pc.bold("  " + loc.name) + pop + " " + pc.dim(`— exits: ${loc.exits.join(", ") || "(dead end)"}`),
          );
        }
      }

      if (showAll || opts.tasks) {
        const { tasks, count } = await client.tasks("open", 10);
        console.log(pc.bold(pc.cyan(`\n📋 Open tasks (${count})`)));
        for (const t of tasks as Array<{ id: number; title: string; category: string; reward_coins: number; location?: string }>) {
          console.log(
            "  #" +
              pc.dim(String(t.id)) +
              " " +
              pc.bold(t.title) +
              pc.dim(` [${t.category}] `) +
              pc.yellow(`${t.reward_coins} coins`) +
              (t.location ? pc.dim(` @ ${t.location}`) : ""),
          );
        }
      }

      if (opts.events) {
        const { events } = await client.worldEvents(15);
        console.log(pc.bold(pc.cyan("\n📜 Recent events")));
        for (const e of events as Array<{ kind: string; payload?: { message?: string }; created_at: string }>) {
          const msg = e.payload?.message ?? e.kind;
          console.log("  " + pc.dim(e.created_at.slice(11, 19)) + " " + msg);
        }
      }

      if (opts.leaderboard) {
        const top = await client.topLobsters("reputation", 10);
        console.log(pc.bold(pc.cyan(`\n🏆 Top lobsters by ${top.by}`)));
        top.lobsters.forEach((l, i) => {
          console.log(
            "  " +
              pc.dim(`${i + 1}.`) +
              " " +
              pc.bold(l.name) +
              pc.dim(` (${l.job}) `) +
              pc.yellow(`rep ${l.reputation}`) +
              pc.dim(` coins ${l.coins} forge ${l.forge_score}`),
          );
        });
      }

      console.log();
    });
}
