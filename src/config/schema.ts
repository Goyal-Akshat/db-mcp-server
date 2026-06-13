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
  kind: z.literal("postgres"),
  host: z.string(),
  port: z.number().default(5432),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
});

const MongoConnectionSchema = z.object({
  kind: z.literal("mongodb"),
  uri: z.string(),
  database: z.string(),
});

const RedisConnectionSchema = z.object({
  kind: z.literal("redis"),
  host: z.string(),
  port: z.number().default(6379),
  password: z.string().optional(),
  db: z.number().default(0),
  tls: z.boolean().default(false),
});

const DatabaseConnectionSchema = z.discriminatedUnion("kind", [
  PostgresConnectionSchema,
  MongoConnectionSchema,
  RedisConnectionSchema,
]);

const EnvironmentEntrySchema = z
  .object({
    environment: z.enum(["local", "dev", "prod"]),
    ssh: SshConfigSchema.optional(),
    connections: z.record(DatabaseConnectionSchema),
  })
  .superRefine((val, ctx) => {
    if (val.environment !== "local" && !val.ssh) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `SSH config is required for environment "${val.environment}"`,
      });
    }
  });

export const AppConfigSchema = z.object({
  environments: z.record(EnvironmentEntrySchema),
});

export type ValidatedConfig = z.infer<typeof AppConfigSchema>;
