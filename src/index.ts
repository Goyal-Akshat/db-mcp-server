import { loadConfig } from "./config/index.js";
import { startStdioServer } from "./server.js";

// Validate config at startup — fail fast with a clear message
try {
  loadConfig();
} catch (err) {
  console.error("[startup] Configuration error:", (err as Error).message);
  process.exit(1);
}

startStdioServer().catch((err) => {
  console.error("[startup] Fatal error:", err);
  process.exit(1);
});
