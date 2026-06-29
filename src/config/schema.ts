import { z } from "zod";

const SshConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(22),
  username: z.string(),
  privateKey: z.string(),
  privateKeyIsPath: z.boolean().default(true),
  passphrase: z.string().optional(),
});

const PostgresConnectionSchema = z.object({
  host: z.string(),
  port: z.number().default(5432),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
});

const MongoConnectionSchema = z.object({
  uri: z.string(),
  database: z.string(),
});

const RedisConnectionSchema = z.object({
  host: z.string(),
  port: z.number().default(6379),
  password: z.string().optional(),
  db: z.number().default(0),
  tls: z.boolean().default(false),
});

const ConfigSchema = z.discriminatedUnion("kind", [
  z.object({
    connectionName: z.string(),
    environment: z.enum(["local", "dev", "prod"]),
    kind: z.literal("postgres"),
    requireSsh: z.boolean().default(false),
    sshConfig: SshConfigSchema.optional(),
    dbConfig: PostgresConnectionSchema,
  }),

  z.object({
    connectionName: z.string(),
    environment: z.enum(["local", "dev", "prod"]),
    kind: z.literal("mongodb"),
    requireSsh: z.boolean().default(false),
    sshConfig: SshConfigSchema.optional(),
    dbConfig: MongoConnectionSchema,
  }),

  z.object({
    connectionName: z.string(),
    environment: z.enum(["local", "dev", "prod"]),
    kind: z.literal("redis"),
    requireSsh: z.boolean().default(false),
    sshConfig: SshConfigSchema.optional(),
    dbConfig: RedisConnectionSchema,
  }),
]);

export const AppConfigSchema = z.array(ConfigSchema);

export type ValidatedConfig = z.infer<typeof AppConfigSchema>;
