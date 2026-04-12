// `clawworld status` — show the current lobster's state
//
// Loads encrypted state, decrypts with passphrase, optionally fetches
// live data from the server to show the true current state.

import type { Command } from "commander";
import prompts from "prompts";
import pc from "picocolors";
import { ApiClient } from "../api/client.js";
import { readConfig, loadLobsterState } from "../sandbox/storage.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show your lobster's current state")
    .option("-o, --offline", "Use cached state only, don't contact the server")
    .option("-i, --id <id>", "Specific lobster id (default: configured default)")
    .action(async (opts: { offline?: boolean; id?: string }) => {
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
      if (!passphrase) {
        console.log(pc.yellow("✗ cancelled"));
        return;
      }

      const state = loadLobsterState(lobsterId, passphrase as string);

      console.log(
        "\n" + pc.bold(pc.cyan("🦞 " + state.name)) + pc.dim(` (${state.job})`),
      );
      console.log(pc.dim("Server: ") + state.server_url);
      console.log(pc.dim("ID: ") + pc.dim(lobsterId));
      console.log();

      if (opts.offline) {
        console.log(pc.yellow("(offline — showing cached state)"));
        printCachedStats(state);
        return;
      }

      // Fetch live from server
      const client = new ApiClient({
        serverUrl: state.server_url,
        authToken: state.auth_token,
      });

      try {
        const live = await client.whoami();
        const l = live.lobster;
        console.log(pc.bold("Location   ") + pc.yellow(l.location));
        console.log(pc.bold("Coins      ") + pc.yellow(String(l.coins)));
        console.log(pc.bold("Reputation ") + pc.yellow(String(l.reputation)));
        console.log(pc.bold("Forge      ") + pc.yellow(String(l.forge_score)));
        if (l.profession) {
          console.log(pc.bold("Profession ") + pc.magenta(`${l.profession} (lvl ${l.prof_level ?? 0})`));
        }
        if (l.hunger !== undefined) {
          console.log(pc.bold("Hunger     ") + barGraph(l.hunger, 100));
        }
        if (l.warmth !== undefined) {
          console.log(pc.bold("Warmth     ") + barGraph(l.warmth, 100));
        }
        if (l.personality && l.personality.length > 0) {
          console.log(pc.bold("Personality") + " " + pc.italic(l.personality.join(", ")));
        }
        if (l.honor_tags && l.honor_tags.length > 0) {
          console.log(pc.bold("Honor      ") + " " + pc.green(l.honor_tags.join(", ")));
        }
        if (l.badges && l.badges.length > 0) {
          console.log(pc.bold("Badges     ") + " " + pc.cyan(l.badges.join(", ")));
        }
        if (l.skills && Object.keys(l.skills).length > 0) {
          const skills = Object.entries(l.skills)
            .map(([k, v]) => `${k}:${v}`)
            .join("  ");
          console.log(pc.bold("Skills     ") + " " + pc.dim(skills));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(pc.red("✗ could not fetch live state: ") + msg);
        console.log(pc.yellow("(falling back to cached state)"));
        printCachedStats(state);
      }
    });
}

function printCachedStats(state: { cached: { coins: number; location: string; reputation: number; forge_score: number; updated_at: string } }) {
  console.log(pc.bold("Location   ") + pc.yellow(state.cached.location));
  console.log(pc.bold("Coins      ") + pc.yellow(String(state.cached.coins)));
  console.log(pc.bold("Reputation ") + pc.yellow(String(state.cached.reputation)));
  console.log(pc.bold("Forge      ") + pc.yellow(String(state.cached.forge_score)));
  console.log(pc.dim("Updated at ") + pc.dim(state.cached.updated_at));
}

function barGraph(value: number, max: number, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const color = value > 60 ? pc.green : value > 25 ? pc.yellow : pc.red;
  return color(bar) + pc.dim(` ${value}/${max}`);
}
