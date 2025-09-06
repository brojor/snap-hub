import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { oneTimeTokens, users } from '../../src/db/schema';
import { sql } from 'drizzle-orm';
import { 
  verifyAndConsumeToken,
  checkTokenValidity,
  storeToken,
  getTokenStats,
  type TokenVerificationResult
} from '../../src/auth/token-verification';
import { 
  generateOneTimeToken,
  hashToken,
  generateTokenForUser,
  createTokenExpiration
} from '../../src/auth/token-generation';

describe('Token Verification and Atomic Consumption', () => {
  let db: ReturnType<typeof drizzle>;
  let client: ReturnType<typeof postgres>;
  let testUserId: number;

  beforeAll(async () => {
    // Use test database configuration
    client = postgres({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'snaphub',
      database: process.env.TEST_DB_NAME || 'postgres',
    });
    
    db = drizzle(client);
    
    // Create a test user for token tests
    const testUser = await db.insert(users).values({
      email: 'tokentest@example.com',
      name: 'Token Test User'
    }).returning({ id: users.id });
    
    testUserId = testUser[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await db.delete(users).where(sql`id = ${testUserId}`);
    }
    await client.end();
  });

  describe('Token storage and retrieval', () => {
    it('should store a token successfully', async () => {
      const { hash, expiresAt } = generateTokenForUser(testUserId);
      const stored = await storeToken(hash, testUserId, expiresAt);
      
      expect(stored).toBe(true);
      
      // Verify token is in database
      const result = await db
        .select()
        .from(oneTimeTokens)
        .where(sql`token_hash = ${hash}`)
        .limit(1);
      
      expect(result.length).toBe(1);
      expect(result[0].userId).toBe(testUserId);
      expect(result[0].used).toBe(false);
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });

    it('should handle storage errors gracefully', async () => {
      // Try to store token with invalid user ID (should fail foreign key constraint)
      const { hash, expiresAt } = generateTokenForUser(999999);
      const stored = await storeToken(hash, 999999, expiresAt);
      
      expect(stored).toBe(false);
    });
  });

  describe('Token validity checking (without consumption)', () => {
    it('should check valid token without consuming it', async () => {
      const { token, hash, expiresAt } = generateTokenForUser(testUserId);
      await storeToken(hash, testUserId, expiresAt);
      
      // Check validity multiple times
      const result1 = await checkTokenValidity(token);
      const result2 = await checkTokenValidity(token);
      
      expect(result1.success).toBe(true);
      expect(result1.userId).toBe(testUserId);
      expect(result2.success).toBe(true);
      expect(result2.userId).toBe(testUserId);
      
      // Verify token is still unused in database
      const dbResult = await db
        .select({ used: oneTimeTokens.used })
        .from(oneTimeTokens)
        .where(sql`token_hash = ${hash}`)
        .limit(1);
      
      expect(dbResult[0].used).toBe(false);
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });

    it('should reject invalid token format in validity check', async () => {
      const result = await checkTokenValidity('invalid-token-format');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_FORMAT');
    });

    it('should detect expired tokens in validity check', async () => {
      const { token, hash } = generateTokenForUser(testUserId);
      const pastExpiration = new Date(Date.now() - 60000); // 1 minute ago
      await storeToken(hash, testUserId, pastExpiration);
      
      const result = await checkTokenValidity(token);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('EXPIRED');
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });
  });

  describe('Atomic token verification and consumption', () => {
    it('should verify and consume a valid token', async () => {
      const { token, hash, expiresAt } = generateTokenForUser(testUserId);
      await storeToken(hash, testUserId, expiresAt);
      
      const result = await verifyAndConsumeToken(token);
      
      expect(result.success).toBe(true);
      expect(result.userId).toBe(testUserId);
      
      // Verify token is marked as used in database
      const dbResult = await db
        .select({ used: oneTimeTokens.used, usedAt: oneTimeTokens.usedAt })
        .from(oneTimeTokens)
        .where(sql`token_hash = ${hash}`)
        .limit(1);
      
      expect(dbResult[0].used).toBe(true);
      expect(dbResult[0].usedAt).toBeDefined();
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });

    it('should reject token with invalid format', async () => {
      const result = await verifyAndConsumeToken('invalid+format/token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('INVALID_FORMAT');
      expect(result.message).toBe('Token must be 16 characters of base64url format');
    });

    it('should reject non-existent token', async () => {
      const fakeToken = generateOneTimeToken();
      const result = await verifyAndConsumeToken(fakeToken);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_FOUND');
      expect(result.message).toBe('Token not found or invalid');
    });

    it('should reject expired token', async () => {
      const { token, hash } = generateTokenForUser(testUserId);
      const pastExpiration = new Date(Date.now() - 60000); // 1 minute ago
      await storeToken(hash, testUserId, pastExpiration);
      
      const result = await verifyAndConsumeToken(token);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('EXPIRED');
      expect(result.message).toBe('Token has expired');
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });

    it('should reject already used token', async () => {
      const { token, hash, expiresAt } = generateTokenForUser(testUserId);
      await storeToken(hash, testUserId, expiresAt);
      
      // First use should succeed
      const result1 = await verifyAndConsumeToken(token);
      expect(result1.success).toBe(true);
      
      // Second use should fail
      const result2 = await verifyAndConsumeToken(token);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('ALREADY_USED');
      expect(result2.message).toBe('Token has already been used');
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });

    it('should handle race conditions atomically', async () => {
      const { token, hash, expiresAt } = generateTokenForUser(testUserId);
      await storeToken(hash, testUserId, expiresAt);
      
      // Simulate concurrent token verification attempts
      const promises = Array.from({ length: 10 }, () => 
        verifyAndConsumeToken(token)
      );
      
      const results = await Promise.all(promises);
      
      // Only one should succeed
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBe(1);
      expect(failureCount).toBe(9);
      
      // All failures should be ALREADY_USED (except the first)
      const alreadyUsedCount = results
        .filter(r => !r.success)
        .filter(r => r.error === 'ALREADY_USED').length;
      
      expect(alreadyUsedCount).toBe(9);
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });
  });

  describe('Token statistics', () => {
    beforeAll(async () => {
      // Create test tokens for stats
      const tokens = [];
      
      // Create 2 active tokens
      for (let i = 0; i < 2; i++) {
        const { hash, expiresAt } = generateTokenForUser(testUserId, 60 * 60 * 1000); // 1 hour
        await storeToken(hash, testUserId, expiresAt);
        tokens.push(hash);
      }
      
      // Create 1 used token
      const { token: usedToken, hash: usedHash, expiresAt: usedExpires } = generateTokenForUser(testUserId);
      await storeToken(usedHash, testUserId, usedExpires);
      await verifyAndConsumeToken(usedToken);
      tokens.push(usedHash);
      
      // Create 1 expired token
      const { hash: expiredHash } = generateTokenForUser(testUserId);
      const pastExpiration = new Date(Date.now() - 60000); // 1 minute ago
      await storeToken(expiredHash, testUserId, pastExpiration);
      tokens.push(expiredHash);
    });

    afterAll(async () => {
      // Clean up all test tokens
      await db.delete(oneTimeTokens).where(sql`user_id = ${testUserId}`);
    });

    it('should provide accurate token statistics', async () => {
      const stats = await getTokenStats(testUserId);
      
      expect(stats.total).toBe(4);
      expect(stats.active).toBe(2);  // 2 unused, non-expired
      expect(stats.used).toBe(1);    // 1 used
      expect(stats.expired).toBe(1); // 1 expired and unused
    });

    it('should return zero stats for user with no tokens', async () => {
      const stats = await getTokenStats(99999); // Non-existent user
      
      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.used).toBe(0);
      expect(stats.expired).toBe(0);
    });
  });

  describe('Integration with token generation', () => {
    it('should work end-to-end with generated tokens', async () => {
      // Generate a complete token for user
      const { token, hash, userId, expiresAt } = generateTokenForUser(testUserId, 30 * 60 * 1000);
      
      expect(userId).toBe(testUserId);
      expect(token).toHaveLength(16);
      expect(hash).toHaveLength(64);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      
      // Store the token
      const stored = await storeToken(hash, userId, expiresAt);
      expect(stored).toBe(true);
      
      // Verify it works with our verification system
      const validityCheck = await checkTokenValidity(token);
      expect(validityCheck.success).toBe(true);
      expect(validityCheck.userId).toBe(testUserId);
      
      // Consume the token
      const consumptionResult = await verifyAndConsumeToken(token);
      expect(consumptionResult.success).toBe(true);
      expect(consumptionResult.userId).toBe(testUserId);
      
      // Verify it can't be used again
      const secondAttempt = await verifyAndConsumeToken(token);
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error).toBe('ALREADY_USED');
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash}`);
    });

    it('should handle hash verification correctly', async () => {
      const token1 = generateOneTimeToken();
      const token2 = generateOneTimeToken();
      
      const hash1 = hashToken(token1);
      const hash2 = hashToken(token2);
      
      // Store token1
      const expiresAt = createTokenExpiration();
      await storeToken(hash1, testUserId, expiresAt);
      
      // Verify token1 works
      const result1 = await checkTokenValidity(token1);
      expect(result1.success).toBe(true);
      
      // Verify token2 doesn't work (different hash)
      const result2 = await checkTokenValidity(token2);
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('NOT_FOUND');
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${hash1}`);
    });
  });
});