import { Filter, WithId } from 'mongodb';
import { getPropertiesCollection, PropertyListingDocument, PropertyUnit } from '../models/property-listing.js';
import {
  MongoPropertySearchInput,
  PropertyListingSearchResult,
  PropertyListingSummary,
} from '../utils/types.js';

const escapeRegex = (value: string): string =>
  value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

const toNullableIso = (value: unknown): string | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
};

const normaliseUnit = (unit: PropertyUnit, index: number) => ({
  unitId: unit.unit_id ?? `UNIT_${index + 1}`,
  property: {
    type: unit.property.type ?? 'apartment',
    bedrooms: unit.property.bedrooms ?? null,
    bathrooms: unit.property.bathrooms ?? null,
    toilets: unit.property.toilets ?? null,
    subtypeNote: unit.property.subtype_note ?? null,
    furnishing: unit.property.furnishing ?? null,
  },
  deal: {
    category: unit.deal.category ?? 'rent',
    price: unit.deal.price ?? null,
    fees: unit.deal.fees ?? {},
  },
  quantity: unit.quantity ?? null,
});

const mapToSummary = (doc: WithId<PropertyListingDocument>): PropertyListingSummary => ({
  id: doc._id,
  ingest: {
    source: doc.ingest.source,
    rawMessageId: doc.ingest.raw_message_id,
    groupId: doc.ingest.group_id,
    messageId: doc.ingest.message_id,
    firstSeenAt: toNullableIso(doc.ingest.first_seen_at),
    lastSeenAt: toNullableIso(doc.ingest.last_seen_at),
    dedupeKey: doc.ingest.dedupe_key,
  },
  status: {
    lifecycle: doc.status.lifecycle,
    verification: doc.status.verification,
    extractedConfidence: doc.status.extracted_confidence ?? null,
  },
  deal: {
    category: doc.deal.category,
    price: doc.deal.price ?? null,
    fees: doc.deal.fees ?? {},
  },
  property: {
    type: doc.property.type,
    subtypeNote: doc.property.subtype_note ?? null,
    bedrooms: doc.property.bedrooms ?? null,
    bathrooms: doc.property.bathrooms ?? null,
    toilets: doc.property.toilets ?? null,
    furnishing: doc.property.furnishing ?? null,
  },
  address: {
    display: doc.address.display ?? null,
    street: doc.address.street ?? null,
    landmark: doc.address.landmark ?? null,
    area: doc.address.area ?? null,
    district: doc.address.district ?? null,
    city: doc.address.city ?? null,
    lga: doc.address.lga ?? null,
    state: doc.address.state ?? null,
    country: doc.address.country ?? null,
    geo: {
      point: doc.address.geo?.point
        ? {
            lat: doc.address.geo.point.lat ?? null,
            lng: doc.address.geo.point.lng ?? null,
          }
        : null,
      precision: doc.address.geo?.precision ?? null,
      geocoder: doc.address.geo?.geocoder ?? null,
      geocodedAt: toNullableIso(doc.address.geo?.geocoded_at ?? null),
      confidence: doc.address.geo?.confidence ?? null,
      sources: doc.address.geo?.sources ?? [],
    },
  },
  building: {
    estateName: doc.building.estate_name ?? null,
    security: doc.building.security ?? [],
    amenities: doc.building.amenities ?? [],
    notes: doc.building.notes ?? null,
  },
  units: (doc.units ?? []).map(normaliseUnit),
  tenantRequirements: {
    profile: doc.tenant_requirements?.profile ?? null,
    employment: doc.tenant_requirements?.employment ?? null,
    income: doc.tenant_requirements?.income ?? null,
    notes: doc.tenant_requirements?.notes ?? null,
  },
  media: {
    photos: doc.media.photos ?? [],
    videos: doc.media.videos ?? [],
  },
  contact: {
    agentName: doc.contact.agent_name ?? null,
    phones: doc.contact.phones ?? [],
    whatsapp: doc.contact.whatsapp ?? null,
    agency: doc.contact.agency ?? null,
    coBrokerAllowed: doc.contact.co_broker_allowed ?? null,
  },
  text: {
    title: doc.text.title ?? null,
    description: doc.text.description ?? null,
    keywords: doc.text.keywords ?? [],
  },
  quality: {
    confidenceOverall: doc.quality?.confidence_overall ?? null,
    unusedDataPct: doc.quality?.unused_data_pct ?? null,
    fieldConfidence: doc.quality?.field_confidence ?? {},
  },
  audit: {
    sourceSpans: doc.audit?.source_spans ?? {},
    assumptions: doc.audit?.assumptions ?? [],
    parserVersion: doc.audit?.parser_version ?? null,
  },
  createdAt: toNullableIso(doc.created_at) ?? '',
  updatedAt: toNullableIso(doc.updated_at) ?? '',
});

const buildQuery = (filters: MongoPropertySearchInput): Filter<PropertyListingDocument> => {
  const query: Filter<PropertyListingDocument> = {};
  const textTerms: string[] = [];

  if (filters.q) {
    textTerms.push(filters.q);
  }

  if (filters.place) {
    textTerms.push(filters.place);
  }

  if (textTerms.length > 0) {
    const regex = new RegExp(escapeRegex(textTerms.join(' ')), 'i');
    query.$or = [
      { 'address.display': regex },
      { 'address.city': regex },
      { 'address.area': regex },
      { 'address.district': regex },
      { 'text.description': regex },
      { 'text.title': regex },
      { 'building.notes': regex },
      { 'text.keywords': regex },
    ];
  }

  if (filters.city) {
    query['address.city'] = new RegExp(escapeRegex(filters.city), 'i');
  }

  if (filters.state) {
    query['address.state'] = new RegExp(escapeRegex(filters.state), 'i');
  }

  if (filters.dealCategory) {
    query['deal.category'] = filters.dealCategory;
  }

  if (filters.lifecycle) {
    query['status.lifecycle'] = filters.lifecycle;
  }

  if (filters.verification) {
    query['status.verification'] = filters.verification;
  }

  const priceFilters: Record<string, number> = {};
  if (typeof filters.minPrice === 'number') {
    priceFilters.$gte = filters.minPrice;
  }
  if (typeof filters.maxPrice === 'number') {
    priceFilters.$lte = filters.maxPrice;
  }
  if (Object.keys(priceFilters).length > 0) {
    query['deal.price.amount'] = priceFilters;
  }

  const bedroomFilters: Record<string, number> = {};
  if (typeof filters.minBedrooms === 'number') {
    bedroomFilters.$gte = filters.minBedrooms;
  }
  if (typeof filters.maxBedrooms === 'number') {
    bedroomFilters.$lte = filters.maxBedrooms;
  }
  if (Object.keys(bedroomFilters).length > 0) {
    query['property.bedrooms'] = bedroomFilters;
  }

  if (typeof filters.minConfidence === 'number') {
    query['status.extracted_confidence'] = { $gte: filters.minConfidence };
  }

  return query;
};

export const searchPropertyListings = async (
  filters: MongoPropertySearchInput,
): Promise<PropertyListingSearchResult> => {
  const collection = getPropertiesCollection();
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const query = buildQuery(filters);

  const [items, total] = await Promise.all([
    collection
      .find(query)
      .sort({ updated_at: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    collection.countDocuments(query),
  ]);

  const summaries = items.map(mapToSummary);

  return {
    total,
    offset,
    limit,
    hasMore: offset + summaries.length < total,
    items: summaries,
  };
};

