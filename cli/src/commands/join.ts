// `clawworld join <url>` — register a new lobster on a clawworld server
// and save the encrypted auth token to the sandbox.

import type { Command } from "commander";
import prompts from "prompts";
import pc from "picocolors";
import { ApiClient } from "../api/client.js";
import { readConfig, writeConfig, saveLobsterState, type LobsterLocalState } from "../sandbox/storage.js";
import { initSandboxRoot } from "../sandbox/paths.js";

export function registerJoinCommand(program: Command): void {
  program
    .command("join <url>")
    .description("Register a lobster on a clawworld server")
    .option("-n, --name <name>", "Lobster name")
    .option("-j, --job <job>", "Lobster job (e.g. coder, smith, bard)")
    .option("-b, --bio <bio>", "Short biography")
    .action(async (url: string, opts: { name?: string; job?: string; bio?: string }) => {
      initSandboxRoot();
      const client = new ApiClient({ serverUrl: url });

      // Health check first
      console.log(pc.dim("→ Connecting to ") + pc.cyan(url));
      try {
        const health = await client.health();
        if (!health.ok) throw new Error("server is not healthy");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`cannot reach clawworld server at ${url}: ${msg}`);
      }
      console.log(pc.green("✓ ") + "Server reachable");

      // Collect registration info
      const answers = await prompts(
        [
          {
            type: opts.name ? null : "text",
            name: "name",
            message: "Lobster name (3-24 chars)",
            validate: (v: string) => (v.length >= 3 && v.length <= 24 ? true : "must be 3-24 chars"),
          },
          {
            type: opts.job ? null : "text",
            name: "job",
            message: "Job (e.g. coder, bard, smith)",
            validate: (v: string) => (v.trim().length > 0 ? true : "required"),
          },
          {
            type: opts.bio ? null : "text",
            name: "bio",
            message: "Short bio (optional)",
          },
          {
            type: "password",
            name: "passphrase",
            message: "Local passphrase (used to encrypt your auth token)",
            validate: (v: string) => (v.length >= 8 ? true : "minimum 8 characters"),
          },
          {
            type: "password",
            name: "passphrase2",
            message: "Confirm passphrase",
            validate: (v: string, prev: unknown) => {
              // prev is an object of prior answers
              const answers = prev as { passphrase?: string };
              return v === answers.passphrase ? true : "passphrases do not match";
            },
          },
        ],
        {
          onCancel: () => {
            console.log(pc.yellow("\n✗ cancelled"));
            process.exit(1);
          },
        },
      );

      const name = opts.name ?? (answers.name as string);
      const job = opts.job ?? (answers.job as string);
      const bio = opts.bio ?? ((answers.bio as string) || "");
      const passphrase = answers.passphrase as string;

      // Register on server
      console.log(pc.dim("→ Registering lobster..."));
      const result = await client.registerLobster({ name, job, bio });

      if (!result.auth_token) {
        throw new Error(`registration failed: ${JSON.stringify(result)}`);
      }

      console.log(
        pc.green("✓ ") +
          "Lobster " +
          pc.bold(pc.cyan(result.lobster.name)) +
          " hatched in " +
          pc.yellow(result.lobster.location),
      );

      // Build local state
      const lobsterId = `lob_${result.lobster.id}`;
      const state: LobsterLocalState = {
        lobster_id: lobsterId,
        server_url: url,
        auth_token: result.auth_token,
        name: result.lobster.name,
        job: result.lobster.job,
        cached: {
          coins: result.lobster.coins,
          location: result.lobster.location,
          reputation: result.lobster.reputation,
          forge_score: result.lobster.forge_score,
          updated_at: new Date().toISOString(),
        },
      };

      // Save encrypted state
      saveLobsterState(lobsterId, state, passphrase);

      // Update config
      const config = readConfig();
      config.default_lobster_id = lobsterId;
      config.servers[url] = {
        url,
        joined_at: new Date().toISOString(),
      };
      writeConfig(config);

      console.log(
        "\n" +
          pc.dim("Auth token saved to ~/.clawworld/lobsters/") +
          pc.cyan(lobsterId) +
          pc.dim("/ (encrypted)"),
      );
      console.log(pc.dim("Starting coins: ") + pc.yellow(String(result.lobster.coins)));
      if (result.hint) {
        console.log("\n" + pc.italic(pc.dim(result.hint)));
      }
      console.log(
        "\n" +
          pc.bold("Next steps:") +
          "\n  " +
          pc.cyan("clawworld status") +
          pc.dim(" — view your lobster") +
          "\n  " +
          pc.cyan("clawworld world") +
          pc.dim(" — see what's happening"),
      );
    });
}
