import { Db } from 'mongodb';
import { getMongoDb } from '../db/mongo.js';
import { ensureIncomingMessageIndexes } from './incoming-message.js';
import { ensurePropertyListingIndexes } from './property-listing.js';
import { ensureProcessingJobIndexes } from './processing-job.js';

let indexesEnsured = false;

export const ensureMongoIndexes = async (db: Db = getMongoDb()): Promise<void> => {
  if (indexesEnsured) {
    return;
  }

  await ensureIncomingMessageIndexes(db);
  await ensurePropertyListingIndexes(db);
  await ensureProcessingJobIndexes(db);

  indexesEnsured = true;
};

export const resetMongoIndexesCache = (): void => {
  indexesEnsured = false;
};

