import { Router } from 'express';
import { authenticateApiKey } from '../middlewares/auth.js';
import { processPendingWhatsAppMessages } from '../services/whatsapp-worker.js';
import { ApiResponse } from '../utils/types.js';

const router = Router();

router.post('/process-pending', authenticateApiKey, async (req, res, next) => {
  try {
    const { batchSize, maxAttempts } = req.body ?? {};

    const result = await processPendingWhatsAppMessages({
      batchSize: typeof batchSize === 'number' ? Math.max(1, Math.min(batchSize, 20)) : undefined,
      maxAttempts: typeof maxAttempts === 'number' ? Math.max(1, Math.min(maxAttempts, 10)) : undefined,
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result,
    };

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

