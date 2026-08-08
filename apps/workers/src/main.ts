import { FakeClock, WingmanEngine, WINDOWS_MS } from "@wingman/domain";
import { runReconcilePass } from "./reconcile.js";

/** When run standalone without shared memory, workers call API /internal/reconcile.
 *  In-process mode is used for tests and single-node dev.
 */
async function main() {
  const api = process.env.API_INTERNAL_URL;
  if (api) {
    const res = await fetch(`${api}/internal/reconcile`, { method: "POST" });
    console.log(await res.json());
    return;
  }
  console.log("No API_INTERNAL_URL; workers expect shared engine via API in production.");
}

if (process.env.NODE_ENV !== "test") {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { runReconcilePass, FakeClock, WingmanEngine, WINDOWS_MS };
