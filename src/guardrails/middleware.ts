import { DbKind, Environment, GuardrailResult } from "../types/index.js";
import { classifyOperation } from "./classifier.js";
import {
  createPendingOperation,
  formatConfirmationMessage,
} from "./confirmation.js";

/**
 * Core guardrail gate. Returns whether to execute immediately or hold for confirmation.
 *
 * Rules:
 *   local  → always execute (any class)
 *   dev    → read: execute; write/dangerous: require confirmation
 *   prod   → read: execute; write/dangerous: require confirmation
 */
export function applyGuardrails(opts: {
  environment: Environment;
  connectionName: string;
  dbKind: DbKind;
  operation: string;
  params: unknown[];
  previewFn: () => string;
}): GuardrailResult {
  const { environment, connectionName, dbKind, operation, params, previewFn } = opts;

  const operationClass = classifyOperation(dbKind, operation, params);

  // Local: no restrictions
  if (environment === "local") {
    return { allowed: true, requiresConfirmation: false };
  }

  // dev/prod + read → allow
  if (operationClass === "read") {
    return { allowed: true, requiresConfirmation: false };
  }

  // dev/prod + write/dangerous → stage for confirmation
  const preview = previewFn();
  const pending = createPendingOperation({
    connectionName,
    environment,
    dbKind,
    operation,
    params,
    operationClass,
    preview,
  });

  return {
    allowed: false,
    requiresConfirmation: true,
    pending,
    reason: formatConfirmationMessage(pending),
  };
}
