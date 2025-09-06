import crypto from 'crypto';

/**
 * Configuration interface for token generation
 */
export interface TokenGenerationConfig {
  entropyBytes: number;
  encoding: 'base64url';
  expectedLength: number;
  hashAlgorithm: 'sha256';
  defaultExpirationMs: number;
}

/**
 * Default configuration for one-time token generation
 * - 96 bits of entropy (12 bytes)
 * - Base64url encoding (URL-safe, no padding)
 * - Results in 16-character tokens
 * - SHA-256 hashing for database storage
 * - 1 hour default expiration
 */
export const DEFAULT_TOKEN_CONFIG: TokenGenerationConfig = {
  entropyBytes: 12, // 96 bits
  encoding: 'base64url',
  expectedLength: 16,
  hashAlgorithm: 'sha256',
  defaultExpirationMs: 60 * 60 * 1000 // 1 hour
} as const;

/**
 * Generate a cryptographically secure one-time token with 96-bit entropy
 * 
 * Uses Node.js crypto.randomBytes() to generate 12 random bytes (96 bits)
 * and encodes them as base64url, resulting in a 16-character URL-safe token.
 * 
 * @returns {string} 16-character base64url encoded token
 * 
 * @example
 * ```typescript
 * const token = generateOneTimeToken();
 * console.log(token); // "AbC123dEf456GhI7"
 * console.log(token.length); // 16
 * ```
 */
export function generateOneTimeToken(): string {
  const randomBytes = crypto.randomBytes(DEFAULT_TOKEN_CONFIG.entropyBytes);
  const token = randomBytes.toString(DEFAULT_TOKEN_CONFIG.encoding);
  
  // Verify the token meets our expected format
  if (token.length !== DEFAULT_TOKEN_CONFIG.expectedLength) {
    throw new Error(`Generated token length ${token.length} does not match expected ${DEFAULT_TOKEN_CONFIG.expectedLength}`);
  }
  
  return token;
}

/**
 * Hash a token using SHA-256 for secure database storage
 * 
 * Never store raw tokens in the database. Always hash them first.
 * This function produces a 64-character hex string suitable for
 * storage in a VARCHAR(64) database column.
 * 
 * @param {string} token - The raw token to hash
 * @returns {string} 64-character SHA-256 hex hash
 * 
 * @example
 * ```typescript
 * const token = generateOneTimeToken();
 * const hash = hashToken(token);
 * console.log(hash.length); // 64
 * console.log(hash); // "a1b2c3d4e5f6..."
 * ```
 */
export function hashToken(token: string): string {
  return crypto
    .createHash(DEFAULT_TOKEN_CONFIG.hashAlgorithm)
    .update(token)
    .digest('hex');
}

/**
 * Validate that a token string matches the expected format
 * 
 * Checks that the token is exactly 16 characters long and contains
 * only base64url characters (A-Z, a-z, 0-9, -, _).
 * 
 * @param {string} token - The token string to validate
 * @returns {boolean} True if token format is valid
 * 
 * @example
 * ```typescript
 * console.log(validateTokenFormat("AbC123dEf456GhI7")); // true
 * console.log(validateTokenFormat("invalid+token")); // false
 * console.log(validateTokenFormat("short")); // false
 * ```
 */
export function validateTokenFormat(token: string): boolean {
  // Check length
  if (token.length !== DEFAULT_TOKEN_CONFIG.expectedLength) {
    return false;
  }
  
  // Check base64url character set only (A-Z, a-z, 0-9, -, _)
  const base64urlPattern = /^[A-Za-z0-9_-]+$/;
  return base64urlPattern.test(token);
}

/**
 * Create an expiration date for a token
 * 
 * @param {number} [timeoutMs] - Custom timeout in milliseconds (defaults to 1 hour)
 * @returns {Date} Expiration date
 * 
 * @example
 * ```typescript
 * // Default 1 hour expiration
 * const expiration1 = createTokenExpiration();
 * 
 * // Custom 30 minute expiration
 * const expiration2 = createTokenExpiration(30 * 60 * 1000);
 * ```
 */
export function createTokenExpiration(timeoutMs?: number): Date {
  const timeout = timeoutMs ?? DEFAULT_TOKEN_CONFIG.defaultExpirationMs;
  return new Date(Date.now() + timeout);
}

/**
 * Generate a complete token record for database insertion
 * 
 * Creates a token, hashes it, and sets expiration time in one operation.
 * Returns both the raw token (for sending to user) and hashed version
 * (for database storage).
 * 
 * @param {number} userId - The user ID this token belongs to
 * @param {number} [expirationMs] - Custom expiration timeout in milliseconds
 * @returns {object} Object containing raw token, hash, and expiration
 * 
 * @example
 * ```typescript
 * const tokenData = generateTokenForUser(123);
 * 
 * // Send tokenData.token to user via email
 * console.log(tokenData.token); // "AbC123dEf456GhI7"
 * 
 * // Store tokenData.hash and tokenData.expiresAt in database
 * await insertToken({
 *   tokenHash: tokenData.hash,
 *   userId: 123,
 *   expiresAt: tokenData.expiresAt
 * });
 * ```
 */
export function generateTokenForUser(userId: number, expirationMs?: number) {
  const token = generateOneTimeToken();
  const hash = hashToken(token);
  const expiresAt = createTokenExpiration(expirationMs);
  
  return {
    token,        // Raw token - send to user
    hash,         // Hashed token - store in database
    userId,       // User ID
    expiresAt,    // Expiration timestamp
  };
}

/**
 * Verify a token matches a stored hash
 * 
 * @param {string} token - Raw token to verify
 * @param {string} storedHash - Hash stored in database
 * @returns {boolean} True if token matches the stored hash
 * 
 * @example
 * ```typescript
 * const isValid = verifyTokenHash("AbC123dEf456GhI7", storedHashFromDB);
 * if (isValid) {
 *   // Token is valid, proceed with authentication
 * }
 * ```
 */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  const tokenHash = hashToken(token);
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(tokenHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}