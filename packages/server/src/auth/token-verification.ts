import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { oneTimeTokens, users } from '../db/schema/index.js';
import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { hashToken, validateTokenFormat } from './token-generation.js';

/**
 * Result of token verification operation
 */
export interface TokenVerificationResult {
  success: boolean;
  userId?: number;
  error?: 'INVALID_FORMAT' | 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_USED' | 'DATABASE_ERROR';
  message?: string;
}

/**
 * Database client for token operations
 * This would typically be injected or configured elsewhere in a real app
 */
function createDatabaseClient() {
  const client = postgres({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'snaphub',
    database: process.env.DB_NAME || 'postgres',
  });
  
  return drizzle(client);
}

/**
 * Atomically verify and consume a one-time token
 * 
 * This function performs atomic token verification and consumption in a single
 * database transaction to prevent race conditions. It:
 * 1. Validates token format
 * 2. Hashes the token
 * 3. Looks up the token in the database
 * 4. Checks if it's unused and not expired
 * 5. Marks it as used atomically
 * 
 * @param {string} token - The raw token to verify and consume
 * @returns {Promise<TokenVerificationResult>} Verification result with user ID if successful
 * 
 * @example
 * ```typescript
 * const result = await verifyAndConsumeToken("AbC123dEf456GhI7");
 * 
 * if (result.success) {
 *   console.log(`Token valid for user ${result.userId}`);
 *   // Create session for user
 * } else {
 *   console.log(`Token invalid: ${result.error} - ${result.message}`);
 * }
 * ```
 */
export async function verifyAndConsumeToken(token: string): Promise<TokenVerificationResult> {
  // Step 1: Validate token format
  if (!validateTokenFormat(token)) {
    return {
      success: false,
      error: 'INVALID_FORMAT',
      message: 'Token must be 16 characters of base64url format'
    };
  }
  
  // Step 2: Hash the token for database lookup
  const tokenHash = hashToken(token);
  const db = createDatabaseClient();
  
  try {
    // Step 3: Atomic verification and consumption using UPDATE with RETURNING
    // This ensures only one request can successfully consume a token
    const now = new Date();
    
    const result = await db
      .update(oneTimeTokens)
      .set({ 
        used: true, 
        usedAt: now 
      })
      .where(
        and(
          eq(oneTimeTokens.tokenHash, tokenHash),
          eq(oneTimeTokens.used, false),           // Must be unused
          gt(oneTimeTokens.expiresAt, now)         // Must not be expired
        )
      )
      .returning({ 
        userId: oneTimeTokens.userId,
        expiresAt: oneTimeTokens.expiresAt
      });
    
    // Step 4: Check if update affected any rows (token was found and consumed)
    if (result.length === 0) {
      // Token either doesn't exist, is already used, or is expired
      // Let's determine which case for better error messaging
      const existingToken = await db
        .select({
          used: oneTimeTokens.used,
          expiresAt: oneTimeTokens.expiresAt
        })
        .from(oneTimeTokens)
        .where(eq(oneTimeTokens.tokenHash, tokenHash))
        .limit(1);
      
      if (existingToken.length === 0) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Token not found or invalid'
        };
      }
      
      const tokenRecord = existingToken[0];
      
      if (tokenRecord.used) {
        return {
          success: false,
          error: 'ALREADY_USED',
          message: 'Token has already been used'
        };
      }
      
      if (tokenRecord.expiresAt <= now) {
        return {
          success: false,
          error: 'EXPIRED',
          message: 'Token has expired'
        };
      }
      
      // This shouldn't happen, but just in case
      return {
        success: false,
        error: 'DATABASE_ERROR',
        message: 'Token verification failed for unknown reason'
      };
    }
    
    // Step 5: Token successfully verified and consumed
    const consumedToken = result[0];
    return {
      success: true,
      userId: consumedToken.userId
    };
    
  } catch (error) {
    console.error('Token verification database error:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Database error during token verification'
    };
  }
}

/**
 * Check if a token exists and is valid without consuming it
 * 
 * This is useful for preview/validation scenarios where you want to
 * check if a token is valid without actually consuming it.
 * 
 * @param {string} token - The raw token to check
 * @returns {Promise<TokenVerificationResult>} Verification result without consumption
 * 
 * @example
 * ```typescript
 * const result = await checkTokenValidity("AbC123dEf456GhI7");
 * 
 * if (result.success) {
 *   console.log(`Token is valid for user ${result.userId}`);
 *   // Show preview of what would happen if token is consumed
 * }
 * ```
 */
export async function checkTokenValidity(token: string): Promise<TokenVerificationResult> {
  // Step 1: Validate token format
  if (!validateTokenFormat(token)) {
    return {
      success: false,
      error: 'INVALID_FORMAT',
      message: 'Token must be 16 characters of base64url format'
    };
  }
  
  // Step 2: Hash the token for database lookup
  const tokenHash = hashToken(token);
  const db = createDatabaseClient();
  
  try {
    const now = new Date();
    
    // Step 3: Check token without modifying it
    const result = await db
      .select({
        userId: oneTimeTokens.userId,
        used: oneTimeTokens.used,
        expiresAt: oneTimeTokens.expiresAt
      })
      .from(oneTimeTokens)
      .where(eq(oneTimeTokens.tokenHash, tokenHash))
      .limit(1);
    
    if (result.length === 0) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'Token not found or invalid'
      };
    }
    
    const tokenRecord = result[0];
    
    if (tokenRecord.used) {
      return {
        success: false,
        error: 'ALREADY_USED',
        message: 'Token has already been used'
      };
    }
    
    if (tokenRecord.expiresAt <= now) {
      return {
        success: false,
        error: 'EXPIRED',
        message: 'Token has expired'
      };
    }
    
    return {
      success: true,
      userId: tokenRecord.userId
    };
    
  } catch (error) {
    console.error('Token validity check database error:', error);
    return {
      success: false,
      error: 'DATABASE_ERROR',
      message: 'Database error during token validity check'
    };
  }
}

/**
 * Store a generated token in the database
 * 
 * @param {string} tokenHash - SHA-256 hash of the token
 * @param {number} userId - User ID the token belongs to
 * @param {Date} expiresAt - When the token expires
 * @returns {Promise<boolean>} True if token was stored successfully
 * 
 * @example
 * ```typescript
 * const { hash, userId, expiresAt } = generateTokenForUser(123);
 * const stored = await storeToken(hash, userId, expiresAt);
 * 
 * if (stored) {
 *   // Send original token to user via email
 *   console.log("Token stored, ready to send to user");
 * }
 * ```
 */
export async function storeToken(tokenHash: string, userId: number, expiresAt: Date): Promise<boolean> {
  const db = createDatabaseClient();
  
  try {
    await db.insert(oneTimeTokens).values({
      tokenHash,
      userId,
      expiresAt,
      used: false,
      usedAt: null
    });
    
    return true;
  } catch (error) {
    console.error('Token storage error:', error);
    return false;
  }
}

/**
 * Get token usage statistics for a user
 * 
 * @param {number} userId - User ID to get stats for
 * @returns {Promise<object>} Token usage statistics
 */
export async function getTokenStats(userId: number) {
  const db = createDatabaseClient();
  
  try {
    const rawStats = await db
      .select({
        total: sql<string>`COUNT(*)::text`,
        used: sql<string>`COUNT(CASE WHEN ${oneTimeTokens.used} = true THEN 1 END)::text`,
        expired: sql<string>`COUNT(CASE WHEN ${oneTimeTokens.expiresAt} <= CURRENT_TIMESTAMP AND ${oneTimeTokens.used} = false THEN 1 END)::text`,
        active: sql<string>`COUNT(CASE WHEN ${oneTimeTokens.expiresAt} > CURRENT_TIMESTAMP AND ${oneTimeTokens.used} = false THEN 1 END)::text`
      })
      .from(oneTimeTokens)
      .where(eq(oneTimeTokens.userId, userId));
    
    const raw = rawStats[0] || { total: '0', used: '0', expired: '0', active: '0' };
    
    return {
      total: parseInt(raw.total, 10),
      used: parseInt(raw.used, 10),
      expired: parseInt(raw.expired, 10),
      active: parseInt(raw.active, 10)
    };
  } catch (error) {
    console.error('Token stats error:', error);
    return { total: 0, used: 0, expired: 0, active: 0 };
  }
}