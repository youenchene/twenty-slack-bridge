import { randomUUID } from "node:crypto";

export interface PendingApproval {
  readonly description: string;
  readonly requesterId: string;
  readonly run: () => Promise<string>;
  readonly expiresAt: number;
}

const TTL_MS = 15 * 60 * 1000;

/**
 * In-memory store for pending write operations that need an Approve/Cancel click.
 * MVP features only create notes (applied directly); any future update/delete must
 * register its action here and post `buildApprovalBlocks`.
 */
export function createApprovalStore(now: () => number = Date.now) {
  const pending = new Map<string, PendingApproval>();
  const sweep = () => {
    for (const [id, p] of pending) if (p.expiresAt <= now()) pending.delete(id);
  };
  return {
    request: (input: Omit<PendingApproval, "expiresAt">): string => {
      sweep();
      const id = randomUUID();
      pending.set(id, { ...input, expiresAt: now() + TTL_MS });
      return id;
    },
    /** Removes and returns the approval so it can only be resolved once. */
    take: (id: string): PendingApproval | undefined => {
      sweep();
      const p = pending.get(id);
      pending.delete(id);
      return p;
    },
  };
}

export type ApprovalStore = ReturnType<typeof createApprovalStore>;
