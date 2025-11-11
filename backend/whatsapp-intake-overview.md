# Agent Buddy WhatsApp Intake Plan

## What We Are Building
- Let incoming WhatsApp property listing flow straight into Agent Buddy.
- Clean up each message with AI so the information drops neatly into our property library.
- Keep the experience reliable without running up cloud costs.

## Step-by-Step Story
- **Capture the ping**  
  A WhatsApp webhook lands on our backend. We validate it, store the raw text, and note who sent it and when.

- **Drop it into storage**  
  The raw message lives in MongoDB (`incoming_messages`). Every record carries a “needs processing” flag.

- **Tap the worker on the shoulder**  
  After we save a message we call a lightweight worker endpoint. No endless polling—just a quick “new job available” nudge.

- **Process in sensible batches**  
  The worker scoops up the newest unprocessed messages (up to a safe batch size), runs them through the LLM, and turns them into structured property listings like the sample you shared.

- **Save the structured listing**  
  Parsed listings go into the dedicated `properties` collection that matches our target document shape. We log confidence scores, assumptions, and links back to the source message.

- **Keep track of what’s done**  
  Any message that fails or succeeds updates its status (`processed`, `retry`, or `failed`) so the worker never reprocesses blindly.

## Collections at a Glance
- `incoming_messages`: raw WhatsApp payload, metadata, status fields, and dedupe markers.
- `properties`: structured entries ready for search, tied back to their source message.
- `processing_jobs` (optional safety net): records batch runs, timing, and error notes for visibility.

## MongoDB Setup Notes
- Environment keys: `MONGODB_URI`, `MONGODB_DB`, `MONGODB_APP_NAME`.
- WhatsApp webhook env keys: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`.
- Worker trigger env key (optional): `WORKER_BASE_URL` when the worker lives on a separate origin; leave blank to skip auto-triggering.
- Default database name: `agent_buddy`; change per environment as needed.
- The driver connection lives in `backend/src/db/mongo.ts`; model definitions live in `backend/src/models/` (`incoming-message.ts`, `property-listing.ts`, `processing-job.ts`).
- Indexes cover processing status, dedupe keys, and property search filters so queries stay quick even as volume grows.
- Mongo connections run as a single shared client; Express startup fails fast if the database is unavailable.

## New Endpoints We Need
- `POST /webhooks/whatsapp`: receives the webhook, validates signatures, stores the message, and triggers the worker.
- `POST /worker/process-messages`: secured internal endpoint the webhook calls; the worker uses it to fetch and process batches.
- `GET /properties/search`: surfaces structured listings with filters (deal type, location, price, confidence, etc.) for the rest of the platform.
- `POST /internal/worker/process-pending`: production route (API-key protected) that claims batches, invokes the parser, and updates Mongo status.

## Cost-Friendly Worker Flow
- Runs only on demand—no idle loops.
- Uses batch sizes and back-off rules to stay within LLM rate limits.
- Logs batch durations so we can tune throughput vs. spend.
- Atomic claims prevent duplicate processing; retry attempts cap at three with exponential back-off controlled server-side.
- Parser calls enforce JSON schema and truncate raw text at ~2.4k characters to control GPT spend per message.

## Connecting to the Existing MCP Stack
- Expose the `properties` collection through a new MCP tool so Agent Buddy can answer property questions with the freshest data.
- Keep dedupe keys and confidence scores so the AI knows what to trust.

## Open Questions (for quick follow-up)
- WhatsApp authentication method (Meta tokens vs. third-party gateway)?
- Preferred LLM provider and token budget per message?
- Retention policy for raw message history?

Once we lock these details, we can move straight into implementation.***

