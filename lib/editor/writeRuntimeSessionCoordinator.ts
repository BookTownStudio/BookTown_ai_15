import { createWriteOperationHash, type WriteChunkSnapshotOperation } from './writeOperationalTypes.ts';
import {
  type WriteCollaborationOperationRecord,
  type WriteCollaboratorPresenceRecord,
} from './writeCollaborationTypes.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

type RuntimeCoordinationMessage =
  | {
      schemaVersion: 1;
      type: 'leader-heartbeat' | 'leader-released';
      scopeKey: string;
      senderInstanceId: string;
      createdAt: number;
      leader?: RuntimeLeaderLease;
    }
  | {
      schemaVersion: 1;
      type: 'operation-publish-request';
      scopeKey: string;
      senderInstanceId: string;
      createdAt: number;
      operation: WriteChunkSnapshotOperation;
    }
  | {
      schemaVersion: 1;
      type: 'remote-operation-records';
      scopeKey: string;
      senderInstanceId: string;
      createdAt: number;
      records: WriteCollaborationOperationRecord[];
    }
  | {
      schemaVersion: 1;
      type: 'presence-records';
      scopeKey: string;
      senderInstanceId: string;
      createdAt: number;
      records: WriteCollaboratorPresenceRecord[];
    };

interface RuntimeLeaderLease {
  schemaVersion: 1;
  scopeKey: string;
  instanceId: string;
  deviceId: string;
  term: number;
  heartbeatAt: number;
  expiresAt: number;
}

interface RuntimeClaimLease {
  schemaVersion: 1;
  scopeKey: string;
  claimKey: string;
  instanceId: string;
  createdAt: number;
  expiresAt: number;
}

export interface RuntimeLeadershipSnapshot {
  scopeKey: string;
  instanceId: string;
  deviceId: string;
  isLeader: boolean;
  leaderInstanceId?: string;
  term: number;
  expiresAt?: number;
}

interface WriteRuntimeSessionCoordinatorParams {
  uid: string;
  projectId: string;
  deviceId: string;
}

const CHANNEL_NAME = 'booktown_write_runtime_coordination';
const LEADER_TTL_MS = 8_000;
const HEARTBEAT_INTERVAL_MS = 2_000;
const ELECTION_INTERVAL_MS = 2_500;
const REPLAY_CLAIM_TTL_MS = 45_000;
const SEQUENCE_CLAIM_TTL_MS = 5_000;
const PUBLICATION_CLAIM_TTL_MS = 60_000;

function createInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `runtime_${crypto.randomUUID()}`;
  }
  return `runtime_${createWriteOperationHash({ now: Date.now(), random: Math.random() })}`;
}

function canUseWindowStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function isLeaseCurrent(lease: RuntimeLeaderLease | RuntimeClaimLease | null, now = Date.now()): boolean {
  return Boolean(lease && lease.expiresAt > now);
}

function scopeKey(params: WriteRuntimeSessionCoordinatorParams): string {
  return createWriteOperationHash({
    uid: params.uid,
    projectId: params.projectId,
    deviceId: params.deviceId,
  });
}

class WriteRuntimeSessionCoordinator {
  readonly scopeKey: string;
  readonly instanceId = createInstanceId();
  readonly deviceId: string;

  private readonly leaderStorageKey: string;
  private readonly claimStoragePrefix: string;
  private channel: BroadcastChannel | null = null;
  private heartbeatTimer: number | null = null;
  private electionTimer: number | null = null;
  private started = false;
  private subscribers = new Set<(snapshot: RuntimeLeadershipSnapshot) => void>();
  private publishHandlers = new Set<(operation: WriteChunkSnapshotOperation) => void>();
  private remoteOperationHandlers = new Set<(records: WriteCollaborationOperationRecord[]) => void>();
  private presenceHandlers = new Set<(records: WriteCollaboratorPresenceRecord[]) => void>();

  constructor(params: WriteRuntimeSessionCoordinatorParams) {
    this.scopeKey = scopeKey(params);
    this.deviceId = params.deviceId;
    this.leaderStorageKey = `booktown_write_runtime:${this.scopeKey}:leader`;
    this.claimStoragePrefix = `booktown_write_runtime:${this.scopeKey}:claim:`;
  }

  start(): void {
    if (this.started || !canUseWindowStorage()) {
      return;
    }

    this.started = true;
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<RuntimeCoordinationMessage>) => {
        this.handleMessage(event.data);
      };
    }
    window.addEventListener('storage', this.handleStorage);
    this.tryAcquireLeadership('start');
    this.heartbeatTimer = window.setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.electionTimer = window.setInterval(() => this.tryAcquireLeadership('interval'), ELECTION_INTERVAL_MS);
  }

  stop(): void {
    if (!this.started) {
      return;
    }
    this.releaseLeadership('stop');
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    if (this.electionTimer) window.clearInterval(this.electionTimer);
    window.removeEventListener('storage', this.handleStorage);
    this.channel?.close();
    this.channel = null;
    this.heartbeatTimer = null;
    this.electionTimer = null;
    this.started = false;
    this.subscribers.clear();
    this.publishHandlers.clear();
    this.remoteOperationHandlers.clear();
    this.presenceHandlers.clear();
  }

  subscribe(callback: (snapshot: RuntimeLeadershipSnapshot) => void): () => void {
    this.start();
    this.subscribers.add(callback);
    callback(this.snapshot());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  onOperationPublishRequest(callback: (operation: WriteChunkSnapshotOperation) => void): () => void {
    this.start();
    this.publishHandlers.add(callback);
    return () => this.publishHandlers.delete(callback);
  }

  onRemoteOperationRecords(callback: (records: WriteCollaborationOperationRecord[]) => void): () => void {
    this.start();
    this.remoteOperationHandlers.add(callback);
    return () => this.remoteOperationHandlers.delete(callback);
  }

  onPresenceRecords(callback: (records: WriteCollaboratorPresenceRecord[]) => void): () => void {
    this.start();
    this.presenceHandlers.add(callback);
    return () => this.presenceHandlers.delete(callback);
  }

  isLeader(): boolean {
    const leader = this.readLeader();
    return Boolean(leader && leader.instanceId === this.instanceId && leader.expiresAt > Date.now());
  }

  hasActiveLeader(): boolean {
    return isLeaseCurrent(this.readLeader());
  }

  snapshot(): RuntimeLeadershipSnapshot {
    const leader = this.readLeader();
    return {
      scopeKey: this.scopeKey,
      instanceId: this.instanceId,
      deviceId: this.deviceId,
      isLeader: this.isLeader(),
      leaderInstanceId: leader?.instanceId,
      term: leader?.term ?? 0,
      expiresAt: leader?.expiresAt,
    };
  }

  async runWithSequenceOwnership<T>(work: () => Promise<T>): Promise<T> {
    const claim = this.claimExclusive('sequence', SEQUENCE_CLAIM_TTL_MS);
    if (!claim) {
      writeEditorTelemetry.increment('sync.crossTabSequenceContention');
      writeEditorTelemetry.log('sync', 'cross_tab_sequence_contention', {
        scopeKey: this.scopeKey,
      }, 'warn');
      await new Promise((resolve) => globalThis.setTimeout(resolve, 75));
    }

    try {
      return await work();
    } finally {
      claim?.release();
    }
  }

  async runWithReplayOwnership<T>(work: () => Promise<T>): Promise<T | null> {
    if (!canUseWindowStorage()) {
      return work();
    }

    this.start();
    if (!this.isLeader()) {
      writeEditorTelemetry.increment('sync.crossTabReplayPrevented');
      writeEditorTelemetry.log('sync', 'cross_tab_replay_prevented', {
        scopeKey: this.scopeKey,
        leaderInstanceId: this.readLeader()?.instanceId,
      }, 'debug');
      return null;
    }

    const claim = this.claimExclusive('replay', REPLAY_CLAIM_TTL_MS);
    if (!claim) {
      writeEditorTelemetry.increment('sync.crossTabReplayPrevented');
      writeEditorTelemetry.log('sync', 'cross_tab_replay_claim_blocked', {
        scopeKey: this.scopeKey,
      }, 'debug');
      return null;
    }

    try {
      return await work();
    } finally {
      claim.release();
    }
  }

  claimOperationPublication(operationId: string): (() => void) | null {
    return this.claimExclusive(`publish:${operationId}`, PUBLICATION_CLAIM_TTL_MS)?.release ?? null;
  }

  requestOperationPublication(operation: WriteChunkSnapshotOperation): boolean {
    this.start();
    if (this.isLeader()) {
      return false;
    }
    if (!this.hasActiveLeader()) {
      this.tryAcquireLeadership('publish-request');
      if (!this.hasActiveLeader()) {
        return false;
      }
    }
    if (this.isLeader()) {
      return false;
    }
    if (!this.channel) {
      return false;
    }

    this.post({
      schemaVersion: 1,
      type: 'operation-publish-request',
      scopeKey: this.scopeKey,
      senderInstanceId: this.instanceId,
      createdAt: Date.now(),
      operation,
    });
    writeEditorTelemetry.increment('sync.operationPublicationDelegated');
    writeEditorTelemetry.log('sync', 'operation_publication_delegated', {
      scopeKey: this.scopeKey,
      operationId: operation.operationId,
      leaderInstanceId: this.readLeader()?.instanceId,
    }, 'debug');
    return true;
  }

  broadcastRemoteOperationRecords(records: WriteCollaborationOperationRecord[]): void {
    if (records.length === 0) return;
    this.post({
      schemaVersion: 1,
      type: 'remote-operation-records',
      scopeKey: this.scopeKey,
      senderInstanceId: this.instanceId,
      createdAt: Date.now(),
      records,
    });
  }

  broadcastPresenceRecords(records: WriteCollaboratorPresenceRecord[]): void {
    this.post({
      schemaVersion: 1,
      type: 'presence-records',
      scopeKey: this.scopeKey,
      senderInstanceId: this.instanceId,
      createdAt: Date.now(),
      records,
    });
  }

  private tryAcquireLeadership(reason: string): void {
    if (!canUseWindowStorage()) {
      return;
    }

    const now = Date.now();
    const current = this.readLeader();
    if (current && current.expiresAt > now && current.instanceId !== this.instanceId) {
      this.emit();
      return;
    }

    const next: RuntimeLeaderLease = {
      schemaVersion: 1,
      scopeKey: this.scopeKey,
      instanceId: this.instanceId,
      deviceId: this.deviceId,
      term: (current?.term ?? 0) + (current?.instanceId === this.instanceId ? 0 : 1),
      heartbeatAt: now,
      expiresAt: now + LEADER_TTL_MS,
    };

    try {
      window.localStorage.setItem(this.leaderStorageKey, JSON.stringify(next));
      const verified = this.readLeader();
      if (verified?.instanceId === this.instanceId) {
        this.post({
          schemaVersion: 1,
          type: 'leader-heartbeat',
          scopeKey: this.scopeKey,
          senderInstanceId: this.instanceId,
          createdAt: now,
          leader: next,
        });
        writeEditorTelemetry.increment('sync.runtimeLeadershipTransition');
        writeEditorTelemetry.log('sync', 'runtime_leadership_acquired', {
          scopeKey: this.scopeKey,
          term: next.term,
          reason,
        }, 'debug');
      }
    } catch (error) {
      writeEditorTelemetry.log('sync', 'runtime_leadership_acquire_failed', {
        scopeKey: this.scopeKey,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
    }
    this.emit();
  }

  private heartbeat(): void {
    if (!this.isLeader()) {
      this.tryAcquireLeadership('heartbeat');
      return;
    }

    const current = this.readLeader();
    if (!current) return;
    const now = Date.now();
    const next: RuntimeLeaderLease = {
      ...current,
      heartbeatAt: now,
      expiresAt: now + LEADER_TTL_MS,
    };
    try {
      window.localStorage.setItem(this.leaderStorageKey, JSON.stringify(next));
      this.post({
        schemaVersion: 1,
        type: 'leader-heartbeat',
        scopeKey: this.scopeKey,
        senderInstanceId: this.instanceId,
        createdAt: now,
        leader: next,
      });
      writeEditorTelemetry.timing('sync.leadershipHeartbeat', 0, {
        scopeKey: this.scopeKey,
      });
    } catch {
      // Leadership will be re-contested by the next interval.
    }
    this.emit();
  }

  private releaseLeadership(reason: string): void {
    if (!canUseWindowStorage() || !this.isLeader()) {
      return;
    }
    try {
      window.localStorage.removeItem(this.leaderStorageKey);
      this.post({
        schemaVersion: 1,
        type: 'leader-released',
        scopeKey: this.scopeKey,
        senderInstanceId: this.instanceId,
        createdAt: Date.now(),
      });
      writeEditorTelemetry.log('sync', 'runtime_leadership_released', {
        scopeKey: this.scopeKey,
        reason,
      }, 'debug');
    } catch {
      // Expiry-based failover still protects correctness.
    }
    this.emit();
  }

  private claimExclusive(claimKey: string, ttlMs: number): { release: () => void } | null {
    this.start();
    if (!canUseWindowStorage()) {
      return { release: () => undefined };
    }

    const storageKey = `${this.claimStoragePrefix}${claimKey}`;
    const now = Date.now();
    const current = safeParse<RuntimeClaimLease>(window.localStorage.getItem(storageKey));
    if (current && current.expiresAt > now && current.instanceId !== this.instanceId) {
      return null;
    }

    const lease: RuntimeClaimLease = {
      schemaVersion: 1,
      scopeKey: this.scopeKey,
      claimKey,
      instanceId: this.instanceId,
      createdAt: now,
      expiresAt: now + ttlMs,
    };

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(lease));
      const verified = safeParse<RuntimeClaimLease>(window.localStorage.getItem(storageKey));
      if (verified?.instanceId !== this.instanceId) {
        return null;
      }
      return {
        release: () => {
          const active = safeParse<RuntimeClaimLease>(window.localStorage.getItem(storageKey));
          if (active?.instanceId === this.instanceId) {
            window.localStorage.removeItem(storageKey);
          }
        },
      };
    } catch {
      return { release: () => undefined };
    }
  }

  private readLeader(): RuntimeLeaderLease | null {
    if (!canUseWindowStorage()) {
      return null;
    }
    const leader = safeParse<RuntimeLeaderLease>(window.localStorage.getItem(this.leaderStorageKey));
    if (!leader || leader.scopeKey !== this.scopeKey) {
      return null;
    }
    return leader;
  }

  private post(message: RuntimeCoordinationMessage): void {
    if (message.senderInstanceId === this.instanceId && message.type !== 'leader-heartbeat') {
      writeEditorTelemetry.gauge('sync.sharedRuntimeCoordinationMessage', 1);
    }
    this.channel?.postMessage(message);
  }

  private handleMessage(message: RuntimeCoordinationMessage): void {
    if (
      !message ||
      message.schemaVersion !== 1 ||
      message.scopeKey !== this.scopeKey ||
      message.senderInstanceId === this.instanceId
    ) {
      return;
    }

    writeEditorTelemetry.gauge('sync.crossTabSynchronizationMessage', 1);
    if (message.type === 'leader-heartbeat' || message.type === 'leader-released') {
      this.emit();
      return;
    }

    if (message.type === 'operation-publish-request') {
      if (!this.isLeader()) {
        return;
      }
      this.publishHandlers.forEach((handler) => handler(message.operation));
      return;
    }

    if (message.type === 'remote-operation-records') {
      this.remoteOperationHandlers.forEach((handler) => handler(message.records));
      return;
    }

    if (message.type === 'presence-records') {
      this.presenceHandlers.forEach((handler) => handler(message.records));
    }
  }

  private handleStorage = (event: StorageEvent): void => {
    if (event.key === this.leaderStorageKey) {
      this.emit();
    }
  };

  private emit(): void {
    const snapshot = this.snapshot();
    writeEditorTelemetry.gauge('sync.runtimeLeadershipIsLeader', snapshot.isLeader ? 1 : 0);
    this.subscribers.forEach((callback) => callback(snapshot));
  }
}

const coordinators = new Map<string, WriteRuntimeSessionCoordinator>();

export function getWriteRuntimeSessionCoordinator(
  params: WriteRuntimeSessionCoordinatorParams
): WriteRuntimeSessionCoordinator {
  const key = scopeKey(params);
  const existing = coordinators.get(key);
  if (existing) {
    return existing;
  }
  const coordinator = new WriteRuntimeSessionCoordinator(params);
  coordinators.set(key, coordinator);
  return coordinator;
}
