import { AnyBulkWriteOperation } from 'mongodb';
import { getIncomingMessagesCollection, IncomingMessageDocument } from '../models/incoming-message.js';
import { logger } from '../middlewares/logging.js';
import { triggerWorker } from './whatsapp-worker-trigger.js';

type WhatsAppWebhookPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: Record<string, unknown>;
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
        }>;
        messages?: Array<Record<string, any>>;
      };
    }>;
  }>;
};

interface PersistResult {
  inserted: number;
  updated: number;
  skipped: number;
}

interface NormalizedMessage {
  changeId: string | null;
  value: Record<string, unknown>;
  contact: {
    name: string | null;
    phone: string | null;
    metadata?: Record<string, unknown>;
  };
  message: Record<string, any>;
}

const parseWebhookPayload = (payload: unknown): NormalizedMessage[] => {
  const result: NormalizedMessage[] = [];
  const castPayload = payload as WhatsAppWebhookPayload;

  if (!Array.isArray(castPayload?.entry)) {
    return result;
  }

  for (const entry of castPayload.entry) {
    if (!Array.isArray(entry?.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (change?.field !== 'messages' || typeof change.value !== 'object' || change.value === null) {
        continue;
      }

      const contacts = Array.isArray(change.value.contacts) ? change.value.contacts : [];
      const messages = Array.isArray(change.value.messages) ? change.value.messages : [];

      for (const message of messages) {
        if (!message || typeof message !== 'object') {
          continue;
        }

        if (message.type !== 'text' || typeof message.text?.body !== 'string') {
          continue;
        }

        const senderWaId = typeof message.from === 'string' ? message.from : null;
        const contact = contacts.find((c) => c?.wa_id === senderWaId) ?? contacts[0];

        result.push({
          changeId: typeof entry?.id === 'string' ? entry.id : null,
          value: change.value as Record<string, unknown>,
          contact: {
            name: contact?.profile?.name ?? null,
            phone: contact?.wa_id ?? senderWaId ?? null,
            metadata: contact ? { ...contact } : undefined,
          },
          message,
        });
      }
    }
  }

  return result;
};

const toIncomingMessageDocument = (normalized: NormalizedMessage): IncomingMessageDocument | null => {
  const now = new Date();

  const messageId = typeof normalized.message.id === 'string' ? normalized.message.id : null;
  if (!messageId) {
    return null;
  }

  let timestampSeconds: number | null = null;
  if (typeof normalized.message.timestamp === 'string') {
    const parsed = Number.parseInt(normalized.message.timestamp, 10);
    timestampSeconds = Number.isNaN(parsed) ? null : parsed;
  } else if (typeof normalized.message.timestamp === 'number') {
    timestampSeconds = Number.isFinite(normalized.message.timestamp)
      ? normalized.message.timestamp
      : null;
  }

  const receivedAt = Number.isFinite(timestampSeconds) ? new Date(timestampSeconds! * 1000) : now;

  return {
    source: 'whatsapp',
    ingest: {
      message_id: messageId,
      group_id:
        typeof normalized.message.context?.id === 'string'
          ? normalized.message.context.id
          : null,
      raw_message_id: messageId,
      dedupe_key: messageId,
      received_at: receivedAt,
      first_seen_at: now,
      last_seen_at: now,
    },
    payload: normalized.value,
    message: {
      text: normalized.message.text?.body ?? '',
    },
    sender: {
      phone: normalized.contact.phone,
      name: normalized.contact.name,
      metadata: normalized.contact.metadata,
    },
    processing: {
      status: 'pending',
      attempts: 0,
      claimed_at: null,
      started_at: null,
      heartbeat_at: null,
      worker_batch_id: null,
    },
    property_listing_id: null,
    created_at: now,
    updated_at: now,
  };
};

export const storeIncomingWhatsAppMessages = async (payload: unknown): Promise<PersistResult> => {
  const collection = getIncomingMessagesCollection();
  const normalizedMessages = parseWebhookPayload(payload);

  if (normalizedMessages.length === 0) {
    logger.info('No WhatsApp text messages detected in webhook payload');
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const operations: AnyBulkWriteOperation<IncomingMessageDocument>[] = [];

  for (const item of normalizedMessages) {
    const doc = toIncomingMessageDocument(item);

    if (!doc) {
      continue;
    }

    const now = new Date();

    operations.push({
      updateOne: {
        filter: { 'ingest.message_id': doc.ingest.message_id },
        update: {
          $setOnInsert: doc,
          $set: {
            'ingest.last_seen_at': now,
            updated_at: now,
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      skipped: normalizedMessages.length,
    };
  }

  const bulkResult = await collection.bulkWrite(operations, { ordered: false });

  const inserted = bulkResult.upsertedCount ?? 0;
  const modified = bulkResult.modifiedCount ?? 0;
  const skipped = Math.max(normalizedMessages.length - inserted - modified, 0);

  if (inserted > 0 || modified > 0) {
    triggerWorker().catch((error) => {
      logger.error({ error }, 'Failed to trigger worker after WhatsApp intake');
    });
  }

  return {
    inserted,
    updated: modified,
    skipped,
  };
};

