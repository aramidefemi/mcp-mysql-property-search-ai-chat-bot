import { Collection, Db, ObjectId } from 'mongodb';
import { getMongoDb } from '../db/mongo.js';

export type IncomingMessageStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface IncomingMessageDocument {
  _id?: ObjectId;
  source: 'whatsapp';
  ingest: {
    message_id: string | null;
    group_id: string | null;
    raw_message_id: string | null;
    dedupe_key: string | null;
    received_at: Date;
    first_seen_at: Date;
    last_seen_at: Date;
  };
  payload: Record<string, unknown>;
  message: {
    text: string;
    media_urls?: string[];
  };
  sender: {
    phone: string | null;
    name: string | null;
    metadata?: Record<string, unknown>;
  };
  processing: {
    status: IncomingMessageStatus;
    attempts: number;
    claimed_at?: Date | null;
    started_at?: Date | null;
    last_attempt_at?: Date;
    last_error?: string;
    worker_batch_id?: string | null;
    heartbeat_at?: Date | null;
    processed_at?: Date;
  };
  property_listing_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLLECTION_NAME = 'incoming_messages';

export const getIncomingMessagesCollection = (db: Db = getMongoDb()): Collection<IncomingMessageDocument> =>
  db.collection<IncomingMessageDocument>(COLLECTION_NAME);

export const ensureIncomingMessageIndexes = async (db: Db = getMongoDb()): Promise<void> => {
  await getIncomingMessagesCollection(db).createIndexes([
    { key: { 'processing.status': 1, created_at: 1 }, name: 'processing_status_created_at' },
    { key: { 'ingest.first_seen_at': 1 }, name: 'ingest_first_seen_at' },
    { key: { 'ingest.dedupe_key': 1 }, name: 'ingest_dedupe_key', unique: false, sparse: true },
    { key: { 'ingest.message_id': 1 }, name: 'ingest_message_id', unique: true, sparse: true },
  ]);
};

