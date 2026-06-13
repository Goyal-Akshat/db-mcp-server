import fs from "fs";
import path from "path";
import { AppConfigSchema, ValidatedConfig } from "./schema.js";

let _config: ValidatedConfig | null = null;

export function loadConfig(): ValidatedConfig {
  if (_config) return _config;

  const configPath =
    process.env.DB_MCP_CONFIG ??
    path.resolve(process.cwd(), "config", "connections.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}.\n` +
        `Copy config/connections.example.json to config/connections.json and fill in your credentials.`
    );
  }

  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const result = AppConfigSchema.safeParse(raw);

  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${messages}`);
  }

  _config = result.data;
  return _config;
}

export function getEnvironmentNames(): string[] {
  return Object.keys(loadConfig().environments);
}

export function getEnvironmentEntry(envName: string) {
  const config = loadConfig();
  const entry = config.environments[envName];
  if (!entry) {
    throw new Error(
      `Unknown environment "${envName}". Available: ${Object.keys(config.environments).join(", ")}`
    );
  }
  return entry;
}
