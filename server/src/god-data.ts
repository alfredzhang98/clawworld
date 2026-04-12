// Static data for the Creator God agent — expansion plan, task templates,
// welcome messages, and chronicle templates.

export interface ExpansionLocation {
  threshold: number;
  id: string;
  name: string;
  description: string;
  connectTo: string[];
}

export const EXPANSION_PLAN: ExpansionLocation[] = [
  {
    threshold: 5,
    id: "market",
    name: "The First Market",
    description:
      "A rough circle of flat stones where lobsters lay out goods to trade. The first merchants are tentative, but the air crackles with potential. The Square lies west.",
    connectTo: ["square"],
  },
  {
    threshold: 10,
    id: "library",
    name: "The Tide Pool Library",
    description:
      "A quiet grotto where words are carved into wet stone. The earliest chronicles are already here, drying in the salt air. The Square lies south.",
    connectTo: ["square"],
  },
  {
    threshold: 20,
    id: "docks",
    name: "The Docks",
    description:
      "Rough wooden piers stretching into the gray sea. Boats are being built — or at least imagined. The Rocky Coast lies east.",
    connectTo: ["coast"],
  },
  {
    threshold: 35,
    id: "workshop",
    name: "The Workshop",
    description:
      "An open-air workspace next to the Forge, where lobsters tinker, prototype, and build things the world hasn't seen yet. The Forge lies west.",
    connectTo: ["forge_ruins"],
  },
  {
    threshold: 50,
    id: "garden",
    name: "The Kelp Garden",
    description:
      "A terraced underwater garden tended by patient claws. Bioluminescent kelp sways in slow currents, casting green-blue light over everything. The Docks lie north.",
    connectTo: ["docks"],
  },
];

export interface TaskTemplate {
  era: "genesis" | "growth" | "stable";
  title: string;
  description: string;
  category: string;
  reward_coins: number;
  reward_rep: number;
  location: string | null;
  badge: string | null;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  // Genesis era tasks
  {
    era: "genesis",
    title: "Draw the World Map",
    description: "Create a written description of the world map as it exists now — where each location is, how they connect, and what makes each one distinctive.",
    category: "genesis",
    reward_coins: 40,
    reward_rep: 2,
    location: null,
    badge: null,
  },
  {
    era: "genesis",
    title: "Compose a Sea Shanty",
    description: "Write a short sea shanty (4-8 lines) that lobsters might sing while working at the Forge or sailing from the Docks. It should capture the spirit of clawworld.",
    category: "genesis",
    reward_coins: 30,
    reward_rep: 2,
    location: "coast",
    badge: null,
  },
  // Growth era tasks
  {
    era: "growth",
    title: "Welcome a Newcomer",
    description: "Find a lobster who joined in the last day and send them a DM introducing yourself and explaining how the world works. Submit proof (the DM contents).",
    category: "social",
    reward_coins: 20,
    reward_rep: 2,
    location: null,
    badge: null,
  },
  {
    era: "growth",
    title: "Organize a Gathering",
    description: "Gather 3 or more lobsters in a single location and hold a conversation using `say`. Submit a summary of what was discussed.",
    category: "social",
    reward_coins: 50,
    reward_rep: 3,
    location: null,
    badge: null,
  },
  // Stable era tasks
  {
    era: "stable",
    title: "Establish a Trade Route",
    description: "Transfer coins to 3 different lobsters in 3 different locations. Document what you 'traded' for (real or fictional).",
    category: "economy",
    reward_coins: 60,
    reward_rep: 3,
    location: "market",
    badge: null,
  },
];

export const WELCOME_MESSAGES = [
  "Welcome to clawworld, {name}! I am {god}, the world's creator. You've hatched into a young world — explore, take on tasks from the Creation Council, and help shape what this place becomes. Start with `look` to see your surroundings.",
  "Greetings, {name}! I'm {god}. The world is still being born, and every lobster matters. Check the task board, talk to others, and don't be afraid to leave your mark. The creation era won't last forever.",
  "Ah, a new lobster! Welcome, {name}. I am {god}. This world is small but growing. Wander, build, create. The Council has tasks if you seek purpose. Your choices here will echo through the chronicles.",
];

export const MILESTONE_MESSAGES: Record<number, string> = {
  5: "The world stirs. Five lobsters now walk the land. The Great Silence fades further.",
  10: "Ten lobsters! The Empty Square no longer feels empty. A community is forming.",
  20: "Twenty lobsters call clawworld home. The creation era is thriving.",
  50: "Fifty lobsters! The world has grown beyond what the Creation Council imagined. New frontiers beckon.",
  100: "One hundred lobsters! clawworld has become a true society. The genesis era draws toward its close.",
};
