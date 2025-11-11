import { MongoClient, Db, MongoClientOptions } from 'mongodb';
import { config } from '../config.js';
import { logger } from '../middlewares/logging.js';
import { DatabaseError } from '../utils/types.js';

let client: MongoClient | null = null;
let database: Db | null = null;

export async function initializeMongo(): Promise<Db> {
  if (database) {
    return database;
  }

  try {
    const options: MongoClientOptions = {
      appName: config.MONGODB_APP_NAME,
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
    };

    client = new MongoClient(config.MONGODB_URI, options);
    await client.connect();
    database = client.db(config.MONGODB_DB);

    logger.info({
      mongoUri: config.MONGODB_URI,
      mongoDb: config.MONGODB_DB,
    }, 'MongoDB connected');

    return database;
  } catch (error) {
    throw new DatabaseError('Failed to initialize MongoDB connection', error);
  }
}

export function getMongoClient(): MongoClient {
  if (!client) {
    throw new DatabaseError('MongoDB client has not been initialized');
  }
  return client;
}

export function getMongoDb(): Db {
  if (!database) {
    throw new DatabaseError('MongoDB database has not been initialized');
  }
  return database;
}

export async function shutdownMongo(): Promise<void> {
  if (client) {
    await client.close();
  }
  client = null;
  database = null;
  logger.info('MongoDB connection closed');
}

