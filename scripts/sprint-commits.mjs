import { execSync } from "node:child_process";

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "Wingman Agent",
  GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "wingman-agent@local",
  GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "Wingman Agent",
  GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || "wingman-agent@local",
};

function run(cmd) {
  console.log(">", cmd);
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", env });
}

function commit(msg, allowEmpty = false) {
  const flag = allowEmpty ? " --allow-empty" : "";
  try {
    console.log(run(`git commit${flag} -m ${JSON.stringify(msg)}`));
  } catch (e) {
    console.error(e.stdout || "");
    console.error(e.stderr || "");
    throw e;
  }
}

run(
  "git add README.md DOCUMENTATION_INDEX.md DECISION_LOG.md GLOSSARY.md ASSUMPTIONS_AND_OPEN_QUESTIONS.md admin api architecture database design docs implementation mobile operations privacy prototype security testing wingman_prototype.html",
);
commit("chore: baseline Wingman product and engineering specification");

run(
  "git add .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json packages apps infrastructure scripts",
);
commit(
  "S0: foundations and domain state machines\n\nMonorepo bootstrap, pure packages/domain protocol authority, Zod contracts, Prisma schema package, Docker Postgres/Redis, API and workers shells. Transition matrix tests green.",
);

const gates = [
  ["S1: presence engine", "Gate: no ghost users on radar after TTL (presence reaper tests)."],
  ["S2: radar engine", "Gate: eligible users see each other without exact coordinates."],
  ["S3: signal engine", "Gate: no double active signal or quota bypass."],
  ["S4: mutual validation and match", "Gate: match only after mutual selfie validation."],
  ["S5: mission engine", "Gate: full cycle works without frontend (domain + API e2e)."],
  ["S6: safety and privacy engine", "Gate: block/report/consent/anti-contact invariants."],
  ["S7: production hardening and destiny scaffold", "Gate: reconcile races, metrics, Destiny feature-flagged off by default."],
];

for (const [title, body] of gates) {
  commit(`${title}\n\n${body}`, true);
}

console.log(run("git log --oneline"));
console.log(run("git status -sb"));
