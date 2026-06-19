import { execSync } from "node:child_process";

// Reseed de database vóór de e2e-run zodat elke flow op een bekende staat begint
// (o.a. de Marge-Waakhond rekent op een schone prijshistorie voor de "eerste
// sync"). Sla over met E2E_SKIP_SEED=1.
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED) return;
  console.log("→ e2e: database reseeden…");
  execSync("npm run db:seed", { stdio: "inherit" });
}
