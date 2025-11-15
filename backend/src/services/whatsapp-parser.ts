import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from '../middlewares/logging.js';
import {
  MoneyValue,
  PropertyListingDocument,
  PropertyUnit,
} from '../models/property-listing.js';

const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
});

const MODEL_NAME = 'gpt-4o-mini';
const MAX_MESSAGE_LENGTH = 2400;

type ParserListing = Partial<PropertyListingDocument> & {
  listing_id?: string | null;
};

interface ParserOptions {
  messageId: string;
  maxListings?: number;
}

export interface ParserResult {
  listings: ParserListing[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  truncated: boolean;
  rawResponse: string;
}

const SYSTEM_PROMPT = [
  'You are a structured data extraction engine for Nigerian property listings.',
  'Parse WhatsApp-style text messages describing rentals or sales.',
  'Always return JSON that conforms to the provided schema.',
  'When information is missing, set the field to null instead of omitting it.',
  'If a message contains more than one listing, output one entry per listing.',
  'Standardise units and currency: use NGN amounts, interpret # or ₦ as Naira.',
  'Infer reasonable defaults when clearly implied (e.g., rent is per_year unless stated otherwise).',
  'Populate quality.field_confidence with scores between 0 and 1 for the fields you fill.',
  'Use snake_case strings for tags such as amenities or keywords.',
].join(' ');

const responseFormat = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'whatsapp_property_listings',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['listings'],
      properties: {
        listings: {
          type: 'array',
          minItems: 0,
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              listing_id: { type: ['string', 'null'] },
              ingest: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  dedupe_key: { type: ['string', 'null'] },
                  first_seen_at: { type: ['string', 'null'], format: 'date-time' },
                  last_seen_at: { type: ['string', 'null'], format: 'date-time' },
                  raw_message_id: { type: ['string', 'null'] },
                  group_id: { type: ['string', 'null'] },
                },
              },
              status: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  lifecycle: { type: ['string', 'null'] },
                  verification: { type: ['string', 'null'] },
                  extracted_confidence: { type: ['number', 'null'] },
                },
              },
              deal: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  category: { type: ['string', 'null'] },
                  price: {
                    type: ['object', 'null'],
                    additionalProperties: true,
                    properties: {
                      amount: { type: ['number', 'null'] },
                      currency: { type: ['string', 'null'] },
                      period: { type: ['string', 'null'] },
                      negotiable: { type: ['boolean', 'null'] },
                    },
                  },
                  fees: { type: 'object', additionalProperties: true },
                },
              },
              property: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  type: { type: ['string', 'null'] },
                  subtype_note: { type: ['string', 'null'] },
                  bedrooms: { type: ['number', 'null'] },
                  bathrooms: { type: ['number', 'null'] },
                  toilets: { type: ['number', 'null'] },
                  furnishing: { type: ['string', 'null'] },
                },
              },
              address: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  display: { type: ['string', 'null'] },
                  street: { type: ['string', 'null'] },
                  landmark: { type: ['string', 'null'] },
                  area: { type: ['string', 'null'] },
                  district: { type: ['string', 'null'] },
                  city: { type: ['string', 'null'] },
                  lga: { type: ['string', 'null'] },
                  state: { type: ['string', 'null'] },
                  country: { type: ['string', 'null'] },
                  geo: {
                    type: ['object', 'null'],
                    additionalProperties: true,
                    properties: {
                      point: {
                        type: ['object', 'null'],
                        additionalProperties: true,
                        properties: {
                          lat: { type: ['number', 'null'] },
                          lng: { type: ['number', 'null'] },
                        },
                      },
                      precision: { type: ['string', 'null'] },
                      geocoder: { type: ['string', 'null'] },
                      geocoded_at: { type: ['string', 'null'], format: 'date-time' },
                      confidence: { type: ['number', 'null'] },
                      sources: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
              },
              building: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  estate_name: { type: ['string', 'null'] },
                  security: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  amenities: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  notes: { type: ['string', 'null'] },
                },
              },
              units: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    unit_id: { type: ['string', 'null'] },
                    property: {
                      type: 'object',
                      additionalProperties: true,
                      properties: {
                        type: { type: ['string', 'null'] },
                        bedrooms: { type: ['number', 'null'] },
                        bathrooms: { type: ['number', 'null'] },
                        subtype_note: { type: ['string', 'null'] },
                      },
                    },
                    deal: {
                      type: 'object',
                      additionalProperties: true,
                      properties: {
                        category: { type: ['string', 'null'] },
                        price: {
                          type: ['object', 'null'],
                          additionalProperties: true,
                          properties: {
                            amount: { type: ['number', 'null'] },
                            currency: { type: ['string', 'null'] },
                            period: { type: ['string', 'null'] },
                            negotiable: { type: ['boolean', 'null'] },
                          },
                        },
                      },
                    },
                    quantity: { type: ['number', 'null'] },
                  },
                },
              },
              tenant_requirements: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  profile: { type: ['string', 'null'] },
                  employment: { type: ['string', 'null'] },
                  income: { type: ['string', 'null'] },
                  notes: { type: ['string', 'null'] },
                },
              },
              media: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  photos: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  videos: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
              contact: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  agent_name: { type: ['string', 'null'] },
                  phones: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  whatsapp: { type: ['string', 'null'] },
                  agency: { type: ['string', 'null'] },
                  co_broker_allowed: { type: ['boolean', 'null'] },
                },
              },
              text: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  title: { type: ['string', 'null'] },
                  description: { type: ['string', 'null'] },
                  keywords: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
              quality: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  confidence_overall: { type: ['number', 'null'] },
                  unused_data_pct: { type: ['number', 'null'] },
                  field_confidence: {
                    type: 'object',
                    additionalProperties: { type: 'number' },
                  },
                },
              },
              audit: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  source_spans: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                  },
                  assumptions: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  parser_version: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  },
};

const sanitizeMessage = (text: string): { content: string; truncated: boolean } => {
  if (!text) {
    return { content: '', truncated: false };
  }
  const trimmed = text.trim();
  if (trimmed.length <= MAX_MESSAGE_LENGTH) {
    return { content: trimmed, truncated: false };
  }
  return { content: trimmed.slice(0, MAX_MESSAGE_LENGTH), truncated: true };
};

const buildUserPrompt = (messageText: string, options: ParserOptions): string =>
  [
    `Message ID: ${options.messageId}`,
    options.maxListings ? `Maximum listings to extract: ${options.maxListings}` : null,
    'Extract as many property listings as the text clearly contains.',
    'Return empty arrays when you cannot find a value.',
    'Set null for any scalar field you cannot determine.',
    'Raw message:',
    '"""',
    messageText,
    '"""',
  ]
    .filter(Boolean)
    .join('\n');

const coerceString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

const coerceBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (['true', 'yes', '1'].includes(value.toLowerCase())) {
      return true;
    }
    if (['false', 'no', '0'].includes(value.toLowerCase())) {
      return false;
    }
  }
  return null;
};

const coerceStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(coerceString)
    .filter((item): item is string => item !== null)
    .slice(0, 20);
};

const coerceMoney = (value: unknown): MoneyValue | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybe = value as Partial<MoneyValue>;
  const amount = coerceNumber(maybe.amount);
  const currency = coerceString(maybe.currency) ?? 'NGN';
  const periodRaw = coerceString(maybe.period);
  const period: 'per_year' | 'per_month' | 'per_week' | 'per_day' | 'sale' | undefined =
    periodRaw === 'per_year' || periodRaw === 'per_month' || periodRaw === 'per_week' ||
    periodRaw === 'per_day' || periodRaw === 'sale'
      ? periodRaw
      : undefined;
  const negotiable = coerceBoolean((maybe as any).negotiable);

  if (amount === null && !period && !negotiable && !currency) {
    return null;
  }

  return {
    amount,
    currency,
    period: period ?? 'per_year',
    negotiable: negotiable ?? false,
    notes: coerceString((maybe as any).notes),
  };
};

const coerceUnit = (value: unknown): PropertyUnit | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Partial<PropertyUnit>;
  const property = source.property ?? {};
  const deal = source.deal ?? {};

  const unitId = coerceString(source.unit_id);

  return {
    unit_id: unitId ?? 'U1',
    property: {
      type: coerceString((property as any).type) ?? 'apartment',
      bedrooms: coerceNumber((property as any).bedrooms),
      bathrooms: coerceNumber((property as any).bathrooms),
      toilets: coerceNumber((property as any).toilets),
      subtype_note: coerceString((property as any).subtype_note),
      furnishing: coerceString((property as any).furnishing),
    },
    deal: {
      category: coerceString((deal as any).category) ?? 'rent',
      price: coerceMoney((deal as any).price),
      fees: typeof (deal as any).fees === 'object' && (deal as any).fees !== null ? (deal as any).fees : {},
    },
    quantity: coerceNumber((value as any).quantity),
  };
};

const normalizeListing = (listing: ParserListing): ParserListing => {
  const normalized: ParserListing = {
    listing_id: coerceString((listing as any).listing_id),
    ingest: {
      dedupe_key: coerceString(listing?.ingest?.dedupe_key) ?? undefined,
      raw_message_id: coerceString(listing?.ingest?.raw_message_id) ?? undefined,
      group_id: coerceString(listing?.ingest?.group_id) ?? undefined,
      first_seen_at: coerceString(listing?.ingest?.first_seen_at) ?? undefined,
      last_seen_at: coerceString(listing?.ingest?.last_seen_at) ?? undefined,
    } as any,
    status: {
      lifecycle: coerceString(listing?.status?.lifecycle) ?? 'active',
      verification: coerceString(listing?.status?.verification) ?? 'unverified',
      extracted_confidence: coerceNumber(listing?.status?.extracted_confidence) ?? 0.6,
    },
    deal: {
      category: coerceString(listing?.deal?.category) ?? 'rent',
      price: coerceMoney(listing?.deal?.price),
      fees:
        listing?.deal?.fees && typeof listing.deal.fees === 'object'
          ? listing.deal.fees
          : {},
    },
    property: {
      type: coerceString(listing?.property?.type) ?? 'apartment',
      subtype_note: coerceString(listing?.property?.subtype_note),
      bedrooms: coerceNumber(listing?.property?.bedrooms),
      bathrooms: coerceNumber(listing?.property?.bathrooms),
      toilets: coerceNumber(listing?.property?.toilets),
      furnishing: coerceString(listing?.property?.furnishing),
    },
    address: {
      display: coerceString(listing?.address?.display) ?? null,
      street: coerceString(listing?.address?.street),
      landmark: coerceString(listing?.address?.landmark),
      area: coerceString(listing?.address?.area),
      district: coerceString(listing?.address?.district),
      city: coerceString(listing?.address?.city),
      lga: coerceString(listing?.address?.lga),
      state: coerceString(listing?.address?.state),
      country: coerceString(listing?.address?.country) ?? 'NG',
      geo: {
        point:
          listing?.address?.geo?.point && typeof listing.address.geo.point === 'object'
            ? {
                lat: coerceNumber((listing.address.geo.point as any).lat) ?? null,
                lng: coerceNumber((listing.address.geo.point as any).lng) ?? null,
              }
            : null,
        precision: coerceString(listing?.address?.geo?.precision) ?? 'area',
        geocoder: coerceString(listing?.address?.geo?.geocoder),
        geocoded_at: coerceString(listing?.address?.geo?.geocoded_at) ? new Date(coerceString(listing?.address?.geo?.geocoded_at)!) : null,
        confidence: coerceNumber(listing?.address?.geo?.confidence),
        sources: coerceStringArray(listing?.address?.geo?.sources),
      },
    },
    building: {
      estate_name: coerceString(listing?.building?.estate_name),
      security: coerceStringArray(listing?.building?.security),
      amenities: coerceStringArray(listing?.building?.amenities),
      notes: coerceString(listing?.building?.notes),
    },
    units: (Array.isArray(listing?.units) ? listing.units : [])
      .map(coerceUnit)
      .filter((unit): unit is PropertyUnit => unit !== null && !!unit.property),
    tenant_requirements: {
      profile: coerceString(listing?.tenant_requirements?.profile),
      employment: coerceString(listing?.tenant_requirements?.employment),
      income: coerceString(listing?.tenant_requirements?.income),
      notes: coerceString(listing?.tenant_requirements?.notes),
    },
    media: {
      photos: coerceStringArray(listing?.media?.photos),
      videos: coerceStringArray(listing?.media?.videos),
    },
    contact: {
      agent_name: coerceString(listing?.contact?.agent_name),
      phones: coerceStringArray(listing?.contact?.phones),
      whatsapp: coerceString(listing?.contact?.whatsapp),
      agency: coerceString(listing?.contact?.agency),
      co_broker_allowed: coerceBoolean(listing?.contact?.co_broker_allowed),
    },
    text: {
      title: coerceString(listing?.text?.title) ?? null,
      description: coerceString(listing?.text?.description) ?? null,
      keywords: coerceStringArray(listing?.text?.keywords),
    },
    quality: {
      confidence_overall: coerceNumber(listing?.quality?.confidence_overall),
      unused_data_pct: coerceNumber(listing?.quality?.unused_data_pct),
      field_confidence:
        listing?.quality?.field_confidence && typeof listing.quality.field_confidence === 'object'
          ? listing.quality.field_confidence
          : {},
    },
    audit: {
      source_spans:
        listing?.audit?.source_spans && typeof listing.audit.source_spans === 'object'
          ? listing.audit.source_spans
          : {},
      assumptions: coerceStringArray(listing?.audit?.assumptions),
      parser_version: coerceString(listing?.audit?.parser_version) ?? 'v0.1',
    },
  };

  return normalized;
};

export const extractListingsFromMessage = async (
  messageText: string,
  options: ParserOptions,
): Promise<ParserResult> => {
  const { content, truncated } = sanitizeMessage(messageText);

  if (!content) {
    return {
      listings: [],
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      truncated,
      rawResponse: '',
    };
  }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserPrompt(content, options) },
  ];

  logger.info(
    {
      messageId: options.messageId,
      truncated,
      model: MODEL_NAME,
    },
    'Submitting WhatsApp listing extraction request',
  );

  const completion = await openai.chat.completions.create({
    model: MODEL_NAME,
    temperature: 0.1,
    max_tokens: 1800,
    response_format: responseFormat,
    messages,
  });

  const rawContent = completion.choices[0]?.message?.content ?? '';

  if (!rawContent) {
    throw new Error('Parser returned empty response');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    logger.error(
      { messageId: options.messageId, rawContent },
      'Failed to parse parser response JSON',
    );
    throw error;
  }

  const listingsSource = (parsed as any)?.listings;
  const listings: ParserListing[] = Array.isArray(listingsSource)
    ? listingsSource.map(normalizeListing)
    : [];

  return {
    listings,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    totalTokens: completion.usage?.total_tokens ?? 0,
    truncated,
    rawResponse: rawContent,
  };
};

