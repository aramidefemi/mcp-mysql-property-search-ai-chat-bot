# Agent Buddy WhatsApp Processing Notes

- **Keep data safe**  
  Every webhook call proves it is from Meta (verify token + signature). We only process messages after storage so nothing gets lost.

- **Process only when invited**  
  The worker starts on demand, grabs a small batch, and stops. No endless loops, so DigitalOcean only bills for real work.

- **One message, one owner**  
  Each inbox record is “claimed” with a timestamp before work begins. If a run crashes, another run can reclaim it after a short timeout. No double-processing.

- **Many listings per message**  
  ChatGPT always returns an array of listings. We upsert each listing separately but tie them back to the same source message so dedupe and audits stay simple.

- **Fill every box**  
  The prompt reminds ChatGPT to follow our schema and to set empty values to `null`. Field confidence and “unused data” scores help us judge quality later.

- **Cost guardrails**  
  Messages longer than ~2.4k characters are chopped to keep token spend under control. Token usage per batch is logged for budget tracking. Retries stop after three attempts.

- **Friendly errors**  
  If parsing fails we store the error message, flip the record back to “pending” (until retries run out), and move on. Bad records never block the queue.

- **API-key protected controls**  
  The internal `/internal/worker/process-pending` route needs our backend API key. Batch size and retry limits can be tuned without redeploying.

- **No overlap storms**  
  The webhook trigger checks a short in-memory flag and backs off for 30 seconds if a batch is already running. `WORKER_BASE_URL` can point at another service; leave it empty to avoid background calls during local work.

- **Future hooks ready**  
  Batch IDs, timestamps, and totals are returned in the response so we can plug monitoring or alerting on top later without extra plumbing.***

