import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid';

/**
 * Generate a new UUID v4
 */
export function generateUuid(): string {
  return uuidv4();
}

/**
 * Validate if a string is a valid UUID v4
 */
export function isValidUuid(id: string): boolean {
  return uuidValidate(id) && uuidVersion(id) === 4;
}

/**
 * Generate a request ID for tracing
 */
export function generateRequestId(): string {
  return generateUuid();
}