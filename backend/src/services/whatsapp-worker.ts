import { ObjectId } from 'mongodb';
import { getIncomingMessagesCollection, IncomingMessageDocument } from '../models/incoming-message.js';
import { getPropertiesCollection, PropertyListingDocument } from '../models/property-listing.js';
import { extractListingsFromMessage } from './whatsapp-parser.js';
import { logger } from '../middlewares/logging.js';
import { generateUuid } from '../utils/ids.js';

const DEFAULT_BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

interface WorkerOptions {
  batchSize?: number;
  maxAttempts?: number;
  claimTimeoutMs?: number;
}

interface WorkerResult {
  batchId: string;
  claimed: number;
  processed: number;
  failed: number;
  skipped: number;
  listingsCreated: number;
  listingsUpdated: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  remainingPending: number;
}

interface ListingSummary {
  created: number;
  updated: number;
}

const buildClaimFilter = (now: Date, maxAttempts: number, timeoutMs: number) => ({
  source: 'whatsapp',
  'processing.attempts': { $lt: maxAttempts },
  $or: [
    { 'processing.status': 'pending' },
    {
      'processing.status': 'processing',
      'processing.heartbeat_at': { $lt: new Date(now.getTime() - timeoutMs) },
    },
  ],
});

const claimPendingMessages = async (
  batchId: string,
  { batchSize, maxAttempts, claimTimeoutMs }: Required<WorkerOptions>,
): Promise<IncomingMessageDocument[]> => {
  const collection = getIncomingMessagesCollection();
  const claimed: IncomingMessageDocument[] = [];
  const now = new Date();

  while (claimed.length < batchSize) {
    const result = await collection.findOneAndUpdate(
      buildClaimFilter(now, maxAttempts, claimTimeoutMs),
      {
        $set: {
          'processing.status': 'processing',
          'processing.claimed_at': now,
          'processing.started_at': now,
          'processing.worker_batch_id': batchId,
          'processing.heartbeat_at': now,
          'processing.last_error': null,
          updated_at: now,
        },
        $inc: {
          'processing.attempts': 1,
        },
        $setOnInsert: {},
      },
      {
        sort: { 'ingest.first_seen_at': 1 },
        returnDocument: 'after',
      },
    );

    if (!result.value) {
      break;
    }

    claimed.push(result.value);
  }

  return claimed;
};

const sanitizeIdentifier = (value: string | null | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-:.]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  return safe.length > 3 ? safe : fallback;
};

const buildListingId = (message: IncomingMessageDocument, index: number, proposed?: string | null): string => {
  const messageKey =
    message.ingest.message_id ??
    (message._id instanceof ObjectId ? message._id.toHexString() : generateUuid());
  const fallback = `listing_${messageKey}_${index + 1}`;
  return sanitizeIdentifier(proposed, fallback);
};

const buildDedupeKey = (
  message: IncomingMessageDocument,
  index: number,
  proposed?: string | null,
): string => {
  if (proposed) {
    return proposed;
  }
  const messageKey =
    message.ingest.message_id ??
    (message._id instanceof ObjectId ? message._id.toHexString() : generateUuid());
  return `whatsapp:${messageKey}:${index + 1}`;
};

const ensureUnits = (units: PropertyListingDocument['units']): PropertyListingDocument['units'] =>
  units.length > 0
    ? units.map((unit, idx) => ({
        unit_id: unit.unit_id ?? `U${idx + 1}`,
        property: {
          type: unit.property.type ?? 'apartment',
          bedrooms: unit.property.bedrooms ?? null,
          bathrooms: unit.property.bathrooms ?? null,
          toilets: unit.property.toilets ?? null,
          subtype_note: unit.property.subtype_note ?? null,
          furnishing: unit.property.furnishing ?? null,
        },
        deal: {
          category: unit.deal.category ?? 'rent',
          price: unit.deal.price ?? null,
          fees: unit.deal.fees ?? {},
        },
        quantity: unit.quantity ?? null,
      }))
    : [
        {
          unit_id: 'U1',
          property: {
            type: 'apartment',
            bedrooms: null,
            bathrooms: null,
            toilets: null,
            subtype_note: null,
            furnishing: null,
          },
          deal: {
            category: 'rent',
            price: null,
            fees: {},
          },
          quantity: null,
        },
      ];

const normalizeListingDocument = (
  message: IncomingMessageDocument,
  index: number,
  listing: Partial<PropertyListingDocument>,
): PropertyListingDocument => {
  const now = new Date();
  const listingId = buildListingId(message, index, (listing as any)?.listing_id);
  const dedupeKey = buildDedupeKey(message, index, listing?.ingest?.dedupe_key ?? null);

  const ingestFirstSeen =
    listing?.ingest?.first_seen_at ??
    message.ingest.first_seen_at?.toISOString?.() ??
    now.toISOString();

  return {
    _id: listingId,
    ingest: {
      source: 'whatsapp',
      raw_message_id: message.ingest.raw_message_id,
      group_id: message.ingest.group_id,
      message_id: message.ingest.message_id,
      first_seen_at: new Date(ingestFirstSeen),
      last_seen_at: now,
      dedupe_key: dedupeKey,
    },
    status: {
      lifecycle: listing?.status?.lifecycle ?? 'active',
      verification: listing?.status?.verification ?? 'unverified',
      extracted_confidence: listing?.status?.extracted_confidence ?? 0.6,
    },
    deal: {
      category: listing?.deal?.category ?? 'rent',
      price: listing?.deal?.price ?? null,
      fees: listing?.deal?.fees ?? {},
    },
    property: {
      type: listing?.property?.type ?? 'apartment',
      subtype_note: listing?.property?.subtype_note ?? null,
      bedrooms: listing?.property?.bedrooms ?? null,
      bathrooms: listing?.property?.bathrooms ?? null,
      toilets: listing?.property?.toilets ?? null,
      furnishing: listing?.property?.furnishing ?? null,
    },
    address: {
      display: listing?.address?.display ?? null,
      street: listing?.address?.street ?? null,
      landmark: listing?.address?.landmark ?? null,
      area: listing?.address?.area ?? null,
      district: listing?.address?.district ?? null,
      city: listing?.address?.city ?? null,
      lga: listing?.address?.lga ?? null,
      state: listing?.address?.state ?? null,
      country: listing?.address?.country ?? 'NG',
      geo: {
        point: listing?.address?.geo?.point ?? null,
        precision: listing?.address?.geo?.precision ?? 'area',
        geocoder: listing?.address?.geo?.geocoder ?? null,
        geocoded_at: listing?.address?.geo?.geocoded_at ?? null,
        confidence: listing?.address?.geo?.confidence ?? null,
        sources: listing?.address?.geo?.sources ?? [],
      },
    },
    building: {
      estate_name: listing?.building?.estate_name ?? null,
      security: listing?.building?.security ?? [],
      amenities: listing?.building?.amenities ?? [],
      notes: listing?.building?.notes ?? null,
    },
    units: ensureUnits(listing?.units ?? []),
    tenant_requirements: {
      profile: listing?.tenant_requirements?.profile ?? null,
      employment: listing?.tenant_requirements?.employment ?? null,
      income: listing?.tenant_requirements?.income ?? null,
      notes: listing?.tenant_requirements?.notes ?? null,
    },
    media: {
      photos: listing?.media?.photos ?? [],
      videos: listing?.media?.videos ?? [],
    },
    contact: {
      agent_name: listing?.contact?.agent_name ?? null,
      phones: listing?.contact?.phones ?? [],
      whatsapp: listing?.contact?.whatsapp ?? null,
      agency: listing?.contact?.agency ?? null,
      co_broker_allowed: listing?.contact?.co_broker_allowed ?? null,
    },
    text: {
      title: listing?.text?.title ?? null,
      description: listing?.text?.description ?? null,
      keywords: listing?.text?.keywords ?? [],
    },
    quality: {
      confidence_overall: listing?.quality?.confidence_overall ?? null,
      unused_data_pct: listing?.quality?.unused_data_pct ?? null,
      field_confidence: listing?.quality?.field_confidence ?? {},
    },
    audit: {
      source_spans: listing?.audit?.source_spans ?? {},
      assumptions: listing?.audit?.assumptions ?? [],
      parser_version: listing?.audit?.parser_version ?? 'v0.1',
    },
    linked_message_ids:
      message._id instanceof ObjectId ? [message._id] : undefined,
    created_at: now,
    updated_at: now,
  };
};

const upsertListings = async (
  message: IncomingMessageDocument,
  listings: Partial<PropertyListingDocument>[],
): Promise<ListingSummary> => {
  const collection = getPropertiesCollection();
  let created = 0;
  let updated = 0;
  const now = new Date();

  for (let index = 0; index < listings.length; index += 1) {
    const draft = listings[index];
    const doc = normalizeListingDocument(message, index, draft);
    const update = await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          ingest: {
            ...doc.ingest,
            first_seen_at: doc.ingest.first_seen_at,
            last_seen_at: now,
          },
          status: doc.status,
          deal: doc.deal,
          property: doc.property,
          address: doc.address,
          building: doc.building,
          units: doc.units,
          tenant_requirements: doc.tenant_requirements,
          media: doc.media,
          contact: doc.contact,
          text: doc.text,
          quality: doc.quality,
          audit: doc.audit,
          updated_at: now,
        },
        $setOnInsert: {
          created_at: now,
        },
        ...(message._id instanceof ObjectId
          ? {
              $addToSet: {
                linked_message_ids: message._id,
              },
            }
          : {}),
      },
      { upsert: true },
    );

    if (update.upsertedCount && update.upsertedCount > 0) {
      created += 1;
    } else if (update.modifiedCount && update.modifiedCount > 0) {
      updated += 1;
    }
  }

  return { created, updated };
};

const markMessageProcessed = async (
  message: IncomingMessageDocument,
  batchId: string,
  summary: { listings: number; promptTokens: number; completionTokens: number; totalTokens: number },
) => {
  const collection = getIncomingMessagesCollection();
  const now = new Date();

  await collection.updateOne(
    { _id: message._id },
    {
      $set: {
        'processing.status': 'processed',
        'processing.processed_at': now,
        'processing.heartbeat_at': null,
        'processing.worker_batch_id': batchId,
        'processing.last_error': null,
        updated_at: now,
        'processing.last_attempt_at': now,
      },
      $setOnInsert: {},
    },
  );

  logger.info(
    {
      messageId: message.ingest.message_id,
      batchId,
      listings: summary.listings,
      tokens: summary.totalTokens,
    },
    'WhatsApp message processed successfully',
  );
};

const markMessageFailed = async (
  message: IncomingMessageDocument,
  batchId: string,
  error: unknown,
  maxAttempts: number,
) => {
  const collection = getIncomingMessagesCollection();
  const now = new Date();
  const shouldRetry = (message.processing.attempts ?? 1) < maxAttempts;
  const nextStatus = shouldRetry ? 'pending' : 'failed';

  await collection.updateOne(
    { _id: message._id },
    {
      $set: {
        'processing.status': nextStatus,
        'processing.last_error': error instanceof Error ? error.message : String(error),
        'processing.worker_batch_id': batchId,
        'processing.heartbeat_at': null,
        'processing.claimed_at': null,
        updated_at: now,
        'processing.last_attempt_at': now,
      },
    },
  );

  logger.error(
    {
      messageId: message.ingest.message_id,
      batchId,
      attempts: message.processing.attempts,
      nextStatus,
      error: error instanceof Error ? error.message : String(error),
    },
    'Failed to process WhatsApp message',
  );
};

const processSingleMessage = async (
  message: IncomingMessageDocument,
  batchId: string,
  maxAttempts: number,
): Promise<{
  listingsCreated: number;
  listingsUpdated: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  skipped: boolean;
}> => {
  if (!message.message?.text) {
    await markMessageProcessed(message, batchId, {
      listings: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    return {
      listingsCreated: 0,
      listingsUpdated: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      skipped: true,
    };
  }

  try {
    const parserResult = await extractListingsFromMessage(message.message.text, {
      messageId:
        message.ingest.message_id ??
        (message._id instanceof ObjectId ? message._id.toHexString() : generateUuid()),
      maxListings: 6,
    });

    if (parserResult.listings.length === 0) {
      await markMessageProcessed(message, batchId, {
        listings: 0,
        promptTokens: parserResult.promptTokens,
        completionTokens: parserResult.completionTokens,
        totalTokens: parserResult.totalTokens,
      });

      return {
        listingsCreated: 0,
        listingsUpdated: 0,
        promptTokens: parserResult.promptTokens,
        completionTokens: parserResult.completionTokens,
        totalTokens: parserResult.totalTokens,
        skipped: true,
      };
    }

    const listingSummary = await upsertListings(message, parserResult.listings);

    await markMessageProcessed(message, batchId, {
      listings: parserResult.listings.length,
      promptTokens: parserResult.promptTokens,
      completionTokens: parserResult.completionTokens,
      totalTokens: parserResult.totalTokens,
    });

    return {
      listingsCreated: listingSummary.created,
      listingsUpdated: listingSummary.updated,
      promptTokens: parserResult.promptTokens,
      completionTokens: parserResult.completionTokens,
      totalTokens: parserResult.totalTokens,
      skipped: false,
    };
  } catch (error) {
    await markMessageFailed(message, batchId, error, maxAttempts);
    throw error;
  }
};

export const processPendingWhatsAppMessages = async (
  options: WorkerOptions = {},
): Promise<WorkerResult> => {
  const batchId = generateUuid();
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const claimTimeoutMs = options.claimTimeoutMs ?? CLAIM_TIMEOUT_MS;

  const claimed = await claimPendingMessages(batchId, {
    batchSize,
    maxAttempts,
    claimTimeoutMs,
  });

  if (claimed.length === 0) {
    const remainingPending = await getIncomingMessagesCollection().countDocuments({
      source: 'whatsapp',
      'processing.status': 'pending',
    });

    return {
      batchId,
      claimed: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
      listingsCreated: 0,
      listingsUpdated: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      remainingPending,
    };
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let listingsCreated = 0;
  let listingsUpdated = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const message of claimed) {
    try {
      const result = await processSingleMessage(message, batchId, maxAttempts);
      processed += 1;
      listingsCreated += result.listingsCreated;
      listingsUpdated += result.listingsUpdated;
      promptTokens += result.promptTokens;
      completionTokens += result.completionTokens;
      totalTokens += result.totalTokens;
      if (result.skipped) {
        skipped += 1;
      }
    } catch {
      failed += 1;
    }
  }

  const remainingPending = await getIncomingMessagesCollection().countDocuments({
    source: 'whatsapp',
    'processing.status': 'pending',
  });

  return {
    batchId,
    claimed: claimed.length,
    processed,
    failed,
    skipped,
    listingsCreated,
    listingsUpdated,
    promptTokens,
    completionTokens,
    totalTokens,
    remainingPending,
  };
};

