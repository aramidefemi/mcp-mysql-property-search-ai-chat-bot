import fetch from 'node-fetch';
import { config } from '../config.js';
import { logger } from '../middlewares/logging.js';
import { processPendingWhatsAppMessages } from './whatsapp-worker.js';

const workerBaseUrl = process.env.WORKER_BASE_URL?.trim();
const WORKER_URL = workerBaseUrl
  ? `${workerBaseUrl.replace(/\/$/, '')}/internal/worker/process-pending`
  : null;
const CONCURRENCY_WINDOW_MS = 30_000;

let inFlight = false;
let lastTriggerAt: number | null = null;

const shouldTrigger = (): boolean => {
  if (inFlight) {
    const elapsed = lastTriggerAt ? Date.now() - lastTriggerAt : 0;
    if (elapsed < CONCURRENCY_WINDOW_MS) {
      return false;
    }
  }

  return true;
};

export const triggerWorker = async (): Promise<void> => {
  if (!shouldTrigger()) {
    logger.debug('Worker trigger skipped due to in-flight request');
    return;
  }

  inFlight = true;
  lastTriggerAt = Date.now();

  try {
    if (WORKER_URL) {
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.BACKEND_API_KEY,
        },
        body: JSON.stringify({}),
        timeout: 10_000,
      });

      if (!response.ok) {
        const text = await response.text();
        logger.warn(
          { status: response.status, body: text },
          'Worker trigger responded with non-200 status',
        );
      } else {
        const data = await response.json().catch(() => ({}));
        logger.info({ data }, 'Worker triggered successfully (remote)');
      }
    } else {
      const result = await processPendingWhatsAppMessages();
      logger.info({ result }, 'Worker processed batch locally');
    }
  } catch (error) {
    logger.error({ error }, 'Worker trigger failed');
  } finally {
    inFlight = false;
  }
};

