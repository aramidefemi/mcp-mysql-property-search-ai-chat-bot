import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../middlewares/logging.js';
import { storeIncomingWhatsAppMessages } from '../services/whatsapp-intake.js';
import { ApiResponse } from '../utils/types.js';

const router = Router();

const verifySignature = (rawBody: string | undefined, signatureHeader: string | undefined): boolean => {
  if (!rawBody || !signatureHeader) {
    return false;
  }

  const expectedPrefix = 'sha256=';

  if (!signatureHeader.startsWith(expectedPrefix)) {
    return false;
  }

  const providedSignature = signatureHeader.substring(expectedPrefix.length);
  const hmac = crypto.createHmac('sha256', config.WHATSAPP_APP_SECRET);
  const digest = hmac.update(rawBody, 'utf8').digest('hex');

  const providedBuffer = Buffer.from(providedSignature, 'hex');
  const digestBuffer = Buffer.from(digest, 'hex');

  if (providedBuffer.length !== digestBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, digestBuffer);
};

router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') {
    logger.info('WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
    return;
  }

  res.status(403).json({
    success: false,
    error: {
      message: 'Invalid verification token',
      code: 'INVALID_VERIFY_TOKEN',
    },
  } satisfies ApiResponse<never>);
});

router.post('/whatsapp', async (req, res) => {
  try {
    const signatureHeader = req.get('x-hub-signature-256');

    if (!verifySignature(req.rawBody, signatureHeader)) {
      logger.warn('Invalid WhatsApp signature received');
      res.status(401).json({
        success: false,
        error: {
          message: 'Invalid signature',
          code: 'INVALID_SIGNATURE',
        },
      } satisfies ApiResponse<never>);
      return;
    }

    const result = await storeIncomingWhatsAppMessages(req.body);

    const response: ApiResponse<{ inserted: number; updated: number; skipped: number }> = {
      success: true,
      data: result,
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error({ error }, 'Error handling WhatsApp webhook');
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to process webhook',
        code: 'WEBHOOK_PROCESSING_ERROR',
      },
    } satisfies ApiResponse<never>);
  }
});

export default router;

