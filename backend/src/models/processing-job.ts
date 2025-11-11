import { Collection, Db, ObjectId } from 'mongodb';
import { getMongoDb } from '../db/mongo.js';

export type ProcessingJobStatus = 'started' | 'completed' | 'failed';

export interface ProcessingJobDocument {
  _id?: ObjectId;
  batch_size: number;
  message_ids: ObjectId[];
  status: ProcessingJobStatus;
  started_at: Date;
  completed_at?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

const COLLECTION_NAME = 'processing_jobs';

export const getProcessingJobsCollection = (db: Db = getMongoDb()): Collection<ProcessingJobDocument> =>
  db.collection<ProcessingJobDocument>(COLLECTION_NAME);

export const ensureProcessingJobIndexes = async (db: Db = getMongoDb()): Promise<void> => {
  await getProcessingJobsCollection(db).createIndexes([
    { key: { status: 1, started_at: -1 }, name: 'status_started_at' },
    { key: { started_at: -1 }, name: 'started_at_desc' },
  ]);
};

