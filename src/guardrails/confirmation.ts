import { v4 as uuidv4 } from "uuid";
import { DbKind, Environment, OperationClass, PendingOperation } from "../types/index.js";

const PENDING_TTL_MS = 5 * 60 * 1000; // tokens expire after 5 minutes

const store = new Map<string, PendingOperation>();

export function createPendingOperation(opts: {
  connectionName: string;
  environment: Environment;
  dbKind: DbKind;
  operation: string;
  params: unknown[];
  operationClass: OperationClass;
  preview: string;
}): PendingOperation {
  const now = new Date();
  const pending: PendingOperation = {
    id: uuidv4(),
    ...opts,
    createdAt: now,
    expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
  };
  store.set(pending.id, pending);
  return pending;
}

export function resolvePendingOperation(token: string): PendingOperation {
  const op = store.get(token);
  if (!op) throw new Error(`No pending operation found for token "${token}"`);
  if (new Date() > op.expiresAt) {
    store.delete(token);
    throw new Error(`Confirmation token "${token}" has expired. Re-run the original command.`);
  }
  store.delete(token);
  return op;
}

export function cancelPendingOperation(token: string): boolean {
  return store.delete(token);
}

export function listPendingOperations(): PendingOperation[] {
  const now = new Date();
  // Prune expired on read
  for (const [id, op] of store) {
    if (now > op.expiresAt) store.delete(id);
  }
  return [...store.values()];
}

/** Human-readable summary for the confirmation prompt */
export function formatConfirmationMessage(op: PendingOperation): string {
  const lines = [
    `⚠️  CONFIRMATION REQUIRED`,
    ``,
    `Environment : ${op.environment.toUpperCase()}`,
    `Connection  : ${op.connectionName}`,
    `DB Type     : ${op.dbKind}`,
    `Risk level  : ${op.operationClass.toUpperCase()}`,
    ``,
    `Operation preview:`,
    `─────────────────────────────────────────`,
    op.preview,
    `─────────────────────────────────────────`,
    ``,
    `Token  : ${op.id}`,
    `Expires: ${op.expiresAt.toISOString()}`,
    ``,
    `To execute, call confirm_operation with token: "${op.id}"`,
    `To cancel,  call cancel_operation  with token: "${op.id}"`,
  ];
  return lines.join("\n");
}
