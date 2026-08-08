import { FakeClock, WingmanEngine } from "@wingman/domain";
import { createApp } from "./app.js";

const destinyEnabled = process.env.DESTINY_ENABLED === "true";
const clock = process.env.FAKE_CLOCK === "true" ? new FakeClock(new Date()) : undefined;
export const engine = new WingmanEngine({ clock, destinyEnabled });
export const app = createApp({ engine });

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Wingman API listening on :${port} utc=${new Date().toISOString()} destiny=${destinyEnabled}`);
  });
}
