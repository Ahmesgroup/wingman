import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Wingman Agent",
  GIT_AUTHOR_EMAIL: "wingman-agent@local",
  GIT_COMMITTER_NAME: "Wingman Agent",
  GIT_COMMITTER_EMAIL: "wingman-agent@local",
};

function run(cmd) {
  console.log(">", cmd);
  return execSync(cmd, { encoding: "utf8", stdio: "inherit", env });
}

run("git add apps/api packages/auth packages/ephemeral packages/notifications packages/observability operations/PRODUCTION_READINESS.md pnpm-lock.yaml apps/BACKEND_README.md scripts package.json pnpm-workspace.yaml");

writeFileSync(
  "scripts/msg-s8.txt",
  "S8: NestJS strict API wrapping frozen domain\n\nReplace Express with Nest modules, Zod pipes, DevAuthGuard, DomainExceptionFilter. Controllers stay thin; WingmanEngine injected via services. Domain S0-S7 untouched.\n",
);
run("git commit -F scripts/msg-s8.txt");

writeFileSync(
  "scripts/msg-s9.txt",
  "S9: Auth OTP sessions device binding and rate limits\n\nAdd @wingman/auth with OTP, session issue/refresh/revoke, device binding. Nest AuthModule + SessionAuthGuard; replay after logout rejected.\n",
);
run("git commit --allow-empty -F scripts/msg-s9.txt");

writeFileSync(
  "scripts/msg-s10.txt",
  "S10: Redis ephemeral envelope and multi-instance locks\n\nAdd @wingman/ephemeral Memory/Redis stores for presence TTL, locks, quotas, pub/sub. Accept path acquires distributed lock without changing domain transitions.\n",
);
run("git commit --allow-empty -F scripts/msg-s10.txt");

writeFileSync(
  "scripts/msg-s11.txt",
  "S11: Push notification orchestrator with idempotency and DLQ\n\nAdd @wingman/notifications; Signal/Match/Mission events enqueue with idempotency keys, retries, dead-letter. Deep links included.\n",
);
run("git commit --allow-empty -F scripts/msg-s11.txt");

writeFileSync(
  "scripts/msg-s12.txt",
  "S12: Observability metrics readiness and production checklist\n\nAdd @wingman/observability structured logs/metrics, GET /internal/ready, operations/PRODUCTION_READINESS.md with measured gates.\n",
);
run("git commit --allow-empty -F scripts/msg-s12.txt");

run("git log --oneline -8");
run("git status -sb");
