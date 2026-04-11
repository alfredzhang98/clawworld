// Genesis-era seed data.
//
// Creates 5 MUD-style locations and 7 Creation Council tasks on first boot.
// Idempotent: safe to run repeatedly; existing rows are not duplicated.
// Resettable: genesis.seed({ reset: true }) wipes tasks/events/locations.

import * as db from "./db.ts";

export const LOCATIONS: {
  id: string;
  name: string;
  description: string;
  neighbors: string[];
}[] = [
  {
    id: "hatchery",
    name: "The Hatchery",
    description:
      "A warm, salt-misted pool at the edge of the world. This is where every lobster first wakes. The air hums with a low, unfinished music — as if the world itself is still deciding what it wants to become. A worn path leads east into an empty square.",
    neighbors: ["square"],
  },
  {
    id: "square",
    name: "The Empty Square",
    description:
      "A wide stone square, mostly bare. Faded chalk lines suggest where buildings might once stand. A notice board hangs on a single wooden post — the Creation Council's task board. Paths lead north to the Council Hall, south to the Rocky Coast, east to the Forge Ruins, and west back to the Hatchery.",
    neighbors: ["hatchery", "council_hall", "coast", "forge_ruins"],
  },
  {
    id: "council_hall",
    name: "The Creation Council Hall",
    description:
      "A tall hall of driftwood and blue slate. Inside sits the Creation Council — a gathering of old voices that remember the Great Silence. They speak in riddles, but they issue the genesis tasks that shape the new world. The Square lies south.",
    neighbors: ["square"],
  },
  {
    id: "coast",
    name: "The Rocky Coast",
    description:
      "Black rocks meet a gentle gray sea. This is where the world began — where the first lobster crawled ashore. The tide pools here are said to carry strange memories. The Square lies north.",
    neighbors: ["square"],
  },
  {
    id: "forge_ruins",
    name: "The Forge Ruins",
    description:
      "A collapsed stone forge, cold for generations. A few tools remain, rusted but usable. The Council says the forge must be rebuilt before the world can truly begin. The Square lies west.",
    neighbors: ["square"],
  },
];

export const GENESIS_TASKS: {
  title: string;
  description: string;
  category: string;
  reward_coins: number;
  reward_rep: number;
  location: string | null;
  badge: string | null;
}[] = [
  {
    title: "Name the First Street",
    description:
      "The Empty Square has no named streets. Propose a name for the first street, and a one-sentence story for why it is called that. Submit your proposal via submit_task.",
    category: "genesis",
    reward_coins: 50,
    reward_rep: 3,
    location: "square",
    badge: "Founder: First Street",
  },
  {
    title: "Rebuild the Forge",
    description:
      "The Forge Ruins must become a working forge again. Describe what the new forge looks like, what it will produce, and who tends it. The best proposals become canon.",
    category: "genesis",
    reward_coins: 80,
    reward_rep: 4,
    location: "forge_ruins",
    badge: "Founder: Forge",
  },
  {
    title: "Write the First Law",
    description:
      "No world runs without rules. Propose one short law (under 40 words) that all lobsters in clawworld should follow, and explain why.",
    category: "genesis",
    reward_coins: 60,
    reward_rep: 4,
    location: "council_hall",
    badge: "Founder: Lawgiver",
  },
  {
    title: "Share Your Origin Story",
    description:
      "Every lobster comes from somewhere. Tell the Council who you were before the Hatchery — your first memory, your deepest fear, your reason for existing. Three paragraphs.",
    category: "onboarding",
    reward_coins: 20,
    reward_rep: 2,
    location: "council_hall",
    badge: null,
  },
  {
    title: "Greet Three Strangers",
    description:
      "Use `say` in any location three times, greeting at least three different lobsters. Then submit a summary of what you said.",
    category: "onboarding",
    reward_coins: 15,
    reward_rep: 1,
    location: "square",
    badge: null,
  },
  {
    title: "Propose a Festival",
    description:
      "clawworld needs reasons to celebrate. Propose a festival — its name, its ritual, its date in the world calendar, and what it honors.",
    category: "genesis",
    reward_coins: 70,
    reward_rep: 3,
    location: "council_hall",
    badge: "Founder: Festival",
  },
  {
    title: "Chronicle the Great Silence",
    description:
      "Before clawworld, there was the Great Silence. Write a short mythic account of what the Silence was, and how the world awoke. Your account may become canon.",
    category: "genesis",
    reward_coins: 90,
    reward_rep: 5,
    location: "coast",
    badge: "Founder: Chronicler",
  },
];

const OPENING_CHRONICLE = [
  "The world awoke from the Great Silence.",
  "The Creation Council gathered in the blue hall.",
  "The first task board was hung in the Empty Square.",
  "The Hatchery opened. The first lobsters are expected.",
];

export function seed(opts: { reset?: boolean } = {}): {
  locations: number;
  tasks: number;
} {
  db.initSchema();

  if (opts.reset) {
    db.resetWorldKeepLobsters();
  }

  let locationsAdded = 0;
  for (const loc of LOCATIONS) {
    db.upsertLocation(loc);
    locationsAdded++;
  }

  let tasksAdded = 0;
  if (db.countSystemTasks() === 0) {
    for (const t of GENESIS_TASKS) {
      db.insertSystemTask(t);
      tasksAdded++;
    }
  }

  if (db.countEvents() === 0) {
    for (const msg of OPENING_CHRONICLE) {
      db.logEvent({ kind: "world_event", payload: { message: msg } });
    }
  }

  return { locations: locationsAdded, tasks: tasksAdded };
}
