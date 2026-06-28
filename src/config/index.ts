import fs from "fs";
import { AppConfigSchema } from "./schema.js";
import { Config } from "../types/index.js";

let configMap: Map<string, Config> | null = null;

export function loadConfig(): Map<string, Config> {
  if (configMap) {
    return configMap;
  }

  const configPath = process.env.CONFIG_PATH;

  if (!configPath) {
    throw new Error("CONFIG_PATH environment variable is not set.");
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}.\n` +
        `Copy config/connections.example.json to config/connections.json and fill in your credentials.`,
    );
  }

  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const result = AppConfigSchema.safeParse(raw);

  if (!result.success) {
    const messages = result.error.errors
      .map((e) => `  • ${e.path.join(".")}: ${e.message}`)
      .join("\n");

    throw new Error(`Invalid config:\n${messages}`);
  }

  configMap = new Map<string, Config>();

  for (const config of result.data) {
    configMap.set(config.connectionName, config as Config);
  }

  return configMap;
}

export function getAvailableConfigs(): {
  connectionName: string;
  environment: string;
  kind: string;
}[] {
  return Array.from(loadConfig().values()).map((config) => ({
    connectionName: config.connectionName,
    environment: config.environment,
    kind: config.kind,
  }));
}

export function getConfig(connectionName: string): Config {
  const config = loadConfig().get(connectionName);

  if (!config) {
    throw new Error(
      `No configuration found with connection name "${connectionName}"`,
    );
  }

  return config;
}
