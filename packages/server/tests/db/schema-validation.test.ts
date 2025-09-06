import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { oneTimeTokens, sessions, users } from '../../src/db/schema';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

describe('Database Schema Validation', () => {
  let db: ReturnType<typeof drizzle>;
  let client: ReturnType<typeof postgres>;
  let testUserId: number;

  beforeAll(async () => {
    // Use test database configuration - same as development for now
    client = postgres({
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'snaphub',
      database: process.env.TEST_DB_NAME || 'postgres',
    });
    
    db = drizzle(client);
    
    // Create a test user for foreign key tests
    const testUser = await db.insert(users).values({
      email: 'test@example.com',
      name: 'Test User'
    }).returning({ id: users.id });
    
    testUserId = testUser[0].id;
  });

  afterAll(async () => {
    // Clean up test user
    if (testUserId) {
      await db.delete(users).where(sql`id = ${testUserId}`);
    }
    await client.end();
  });

  describe('one_time_tokens table', () => {
    it('should have correct table structure', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'one_time_tokens'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.map(row => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default
      }));
      
      expect(columns).toEqual([
        { name: 'token_hash', type: 'character varying', nullable: false, default: null },
        { name: 'user_id', type: 'integer', nullable: false, default: null },
        { name: 'created_at', type: 'timestamp with time zone', nullable: false, default: 'now()' },
        { name: 'expires_at', type: 'timestamp with time zone', nullable: false, default: null },
        { name: 'used_at', type: 'timestamp with time zone', nullable: true, default: null },
        { name: 'used', type: 'boolean', nullable: false, default: 'false' }
      ]);
    });

    it('should have primary key constraint on token_hash', async () => {
      const result = await db.execute(sql`
        SELECT constraint_name, constraint_type 
        FROM information_schema.table_constraints 
        WHERE table_name = 'one_time_tokens' AND constraint_type = 'PRIMARY KEY';
      `);
      
      expect(result.length).toBe(1);
      expect(result[0].constraint_type).toBe('PRIMARY KEY');
    });

    it('should have foreign key constraint to users table', async () => {
      const result = await db.execute(sql`
        SELECT constraint_name, constraint_type 
        FROM information_schema.table_constraints 
        WHERE table_name = 'one_time_tokens' AND constraint_type = 'FOREIGN KEY';
      `);
      
      expect(result.length).toBeGreaterThan(0);
    });

    it('should have required indexes for performance', async () => {
      const result = await db.execute(sql`
        SELECT indexname, indexdef
        FROM pg_indexes 
        WHERE tablename = 'one_time_tokens';
      `);
      
      const indexNames = result.map(row => row.indexname);
      
      // Should have indexes on user_id, expires_at, and used columns
      expect(indexNames).toContain('idx_one_time_tokens_user_id');
      expect(indexNames).toContain('idx_one_time_tokens_expires_at');
      expect(indexNames).toContain('idx_one_time_tokens_used');
    });

    it('should enforce token_hash length constraint (64 chars for SHA-256)', async () => {
      const validTokenHash = crypto.createHash('sha256').update('test-token').digest('hex');
      expect(validTokenHash).toHaveLength(64);
      
      // Test that 64-char hash is accepted
      await expect(
        db.insert(oneTimeTokens).values({
          tokenHash: validTokenHash,
          userId: testUserId,
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        })
      ).resolves.toBeDefined();
      
      // Clean up
      await db.delete(oneTimeTokens).where(sql`token_hash = ${validTokenHash}`);
    });
  });

  describe('sessions table', () => {
    it('should have correct table structure', async () => {
      const result = await db.execute(sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'sessions'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.map(row => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default
      }));
      
      expect(columns).toEqual([
        { name: 'session_id', type: 'character varying', nullable: false, default: null },
        { name: 'user_id', type: 'integer', nullable: false, default: null },
        { name: 'created_at', type: 'timestamp with time zone', nullable: false, default: 'now()' },
        { name: 'expires_at', type: 'timestamp with time zone', nullable: false, default: null },
        { name: 'last_seen_at', type: 'timestamp with time zone', nullable: false, default: 'now()' }
      ]);
    });

    it('should have primary key constraint on session_id', async () => {
      const result = await db.execute(sql`
        SELECT constraint_name, constraint_type 
        FROM information_schema.table_constraints 
        WHERE table_name = 'sessions' AND constraint_type = 'PRIMARY KEY';
      `);
      
      expect(result.length).toBe(1);
      expect(result[0].constraint_type).toBe('PRIMARY KEY');
    });

    it('should have foreign key constraint to users table', async () => {
      const result = await db.execute(sql`
        SELECT constraint_name, constraint_type 
        FROM information_schema.table_constraints 
        WHERE table_name = 'sessions' AND constraint_type = 'FOREIGN KEY';
      `);
      
      expect(result.length).toBeGreaterThan(0);
    });

    it('should have required indexes for performance', async () => {
      const result = await db.execute(sql`
        SELECT indexname
        FROM pg_indexes 
        WHERE tablename = 'sessions';
      `);
      
      const indexNames = result.map(row => row.indexname);
      
      // Should have indexes on user_id, expires_at, and last_seen_at columns
      expect(indexNames).toContain('idx_sessions_user_id');
      expect(indexNames).toContain('idx_sessions_expires_at');
      expect(indexNames).toContain('idx_sessions_last_seen_at');
    });

    it('should enforce session_id length constraint (128 chars)', async () => {
      const validSessionId = crypto.randomBytes(64).toString('hex'); // 128 chars
      expect(validSessionId).toHaveLength(128);
      
      // Test that 128-char session ID is accepted
      await expect(
        db.insert(sessions).values({
          sessionId: validSessionId,
          userId: testUserId,
          expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
        })
      ).resolves.toBeDefined();
      
      // Clean up
      await db.delete(sessions).where(sql`session_id = ${validSessionId}`);
    });
  });

  describe('Token generation and validation utilities', () => {
    it('should generate 96-bit entropy tokens with 16-character base64url encoding', () => {
      const tokenBytes = crypto.randomBytes(12); // 96 bits
      const token = tokenBytes.toString('base64url');
      
      expect(token).toHaveLength(16);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url character set
    });

    it('should generate SHA-256 hashes for token storage', () => {
      const token = crypto.randomBytes(12).toString('base64url');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/); // hex character set
    });

    it('should generate cryptographically secure session IDs', () => {
      const sessionId = crypto.randomBytes(64).toString('hex');
      
      expect(sessionId).toHaveLength(128);
      expect(sessionId).toMatch(/^[a-f0-9]+$/); // hex character set
    });
  });

  describe('Database cleanup operations', () => {
    beforeAll(async () => {
      // Insert test data for cleanup tests
      const expiredToken = crypto.createHash('sha256').update('expired-token').digest('hex');
      const activeToken = crypto.createHash('sha256').update('active-token').digest('hex');
      
      await db.insert(oneTimeTokens).values([
        {
          tokenHash: expiredToken,
          userId: testUserId,
          expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        },
        {
          tokenHash: activeToken,
          userId: testUserId,
          expiresAt: new Date(Date.now() + 3600000), // Expires in 1 hour
        }
      ]);
    });

    afterAll(async () => {
      // Clean up test data
      await db.execute(sql`DELETE FROM one_time_tokens WHERE user_id = ${testUserId}`);
      await db.execute(sql`DELETE FROM sessions WHERE user_id = ${testUserId}`);
    });

    it('should be able to clean up expired tokens', async () => {
      const beforeCount = await db.execute(sql`SELECT COUNT(*) as count FROM one_time_tokens WHERE user_id = ${testUserId}`);
      expect(beforeCount[0].count).toBe('2');
      
      // Clean up expired tokens
      await db.execute(sql`DELETE FROM one_time_tokens WHERE expires_at < CURRENT_TIMESTAMP`);
      
      const afterCount = await db.execute(sql`SELECT COUNT(*) as count FROM one_time_tokens WHERE user_id = ${testUserId}`);
      expect(afterCount[0].count).toBe('1');
    });

    it('should be able to clean up expired sessions', async () => {
      // Insert test sessions
      const expiredSession = crypto.randomBytes(64).toString('hex');
      const activeSession = crypto.randomBytes(64).toString('hex');
      
      await db.insert(sessions).values([
        {
          sessionId: expiredSession,
          userId: testUserId,
          expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        },
        {
          sessionId: activeSession,
          userId: testUserId,
          expiresAt: new Date(Date.now() + 3600000), // Expires in 1 hour
        }
      ]);
      
      const beforeCount = await db.execute(sql`SELECT COUNT(*) as count FROM sessions WHERE user_id = ${testUserId}`);
      expect(beforeCount[0].count).toBe('2');
      
      // Clean up expired sessions
      await db.execute(sql`DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP`);
      
      const afterCount = await db.execute(sql`SELECT COUNT(*) as count FROM sessions WHERE user_id = ${testUserId}`);
      expect(afterCount[0].count).toBe('1');
    });
  });
});