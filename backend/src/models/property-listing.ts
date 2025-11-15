import { Collection, Db, ObjectId } from 'mongodb';
import { getMongoDb } from '../db/mongo.js';

export interface MoneyValue {
  amount: number | null;
  currency: string | null;
  period?: 'per_year' | 'per_month' | 'per_week' | 'per_day' | 'sale';
  negotiable?: boolean;
  notes?: string | null;
}

export interface UnitDeal {
  category: 'rent' | 'sale' | 'lease' | 'shortlet' | string;
  price?: MoneyValue | null;
  fees?: Record<string, MoneyValue | number | string>;
}

export interface PropertyUnit {
  unit_id: string;
  property: {
    type: string;
    bedrooms?: number | null;
    bathrooms?: number | null;
    toilets?: number | null;
    subtype_note?: string | null;
    furnishing?: string | null;
  };
  deal: UnitDeal;
  quantity?: number | null;
}

export interface PropertyListingDocument {
  _id: string;
  ingest: {
    source: 'whatsapp' | string;
    raw_message_id: string | null;
    group_id: string | null;
    message_id: string | null;
    first_seen_at: Date;
    last_seen_at: Date;
    dedupe_key: string;
  };
  status: {
    lifecycle: 'active' | 'inactive' | 'archived' | 'deleted' | string;
    verification: 'unverified' | 'verified' | 'flagged' | string;
    extracted_confidence: number | null;
  };
  deal: {
    category: 'rent' | 'sale' | 'lease' | 'shortlet' | string;
    price: MoneyValue | null;
    fees: Record<string, MoneyValue | number | string>;
  };
  property: {
    type: string;
    subtype_note?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
    toilets?: number | null;
    furnishing?: string | null;
  };
  address: {
    display: string | null;
    street?: string | null;
    landmark?: string | null;
    area?: string | null;
    district?: string | null;
    city?: string | null;
    lga?: string | null;
    state?: string | null;
    country?: string | null;
    geo?: {
      point?: { lat: number | null; lng: number | null } | null;
      precision?: 'exact' | 'street' | 'area' | 'city' | 'state' | string;
      geocoder?: string | null;
      geocoded_at?: Date | null;
      confidence?: number | null;
      sources?: string[];
    };
  };
  building: {
    estate_name?: string | null;
    security?: string[];
    amenities?: string[];
    notes?: string | null;
  };
  units: PropertyUnit[];
  tenant_requirements?: {
    profile?: string | null;
    employment?: string | null;
    income?: string | null;
    notes?: string | null;
  };
  media: {
    photos: string[];
    videos: string[];
  };
  contact: {
    agent_name?: string | null;
    phones?: string[];
    whatsapp?: string | null;
    agency?: string | null;
    co_broker_allowed?: boolean | null;
  };
  text: {
    title: string | null;
    description: string | null;
    keywords: string[];
  };
  quality?: {
    confidence_overall?: number | null;
    unused_data_pct?: number | null;
    field_confidence?: Record<string, number>;
  };
  audit?: {
    source_spans?: Record<string, string>;
    assumptions?: string[];
    parser_version?: string;
  };
  linked_message_ids?: ObjectId[];
  created_at: Date;
  updated_at: Date;
}

const COLLECTION_NAME = 'properties';

export const getPropertiesCollection = (db: Db = getMongoDb()): Collection<PropertyListingDocument> =>
  db.collection<PropertyListingDocument>(COLLECTION_NAME);

export const ensurePropertyListingIndexes = async (db: Db = getMongoDb()): Promise<void> => {
  await getPropertiesCollection(db).createIndexes([
    { key: { 'status.lifecycle': 1, 'status.verification': 1 }, name: 'status_lifecycle_verification' },
    { key: { 'address.city': 1, 'address.state': 1 }, name: 'address_city_state', sparse: true },
    { key: { 'deal.category': 1 }, name: 'deal_category', sparse: true },
    { key: { 'text.keywords': 1 }, name: 'text_keywords' },
    { key: { updated_at: -1 }, name: 'updated_at_desc' },
  ]);
};

