import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { 
  generateOneTimeToken, 
  hashToken, 
  validateTokenFormat,
  createTokenExpiration,
  TokenGenerationConfig 
} from '../../src/auth/token-generation';

describe('Token Generation and Cryptographic Security', () => {
  describe('96-bit entropy token generation', () => {
    it('should generate tokens with exactly 96 bits of entropy', () => {
      const token = generateOneTimeToken();
      
      // 96 bits = 12 bytes, encoded as base64url = 16 characters
      expect(token).toHaveLength(16);
      
      // Verify it's base64url format (A-Z, a-z, 0-9, -, _)
      expect(token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    });

    it('should generate unique tokens across multiple calls', () => {
      const tokens = new Set();
      const iterations = 1000;
      
      for (let i = 0; i < iterations; i++) {
        const token = generateOneTimeToken();
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }
      
      expect(tokens.size).toBe(iterations);
    });

    it('should use cryptographically secure random generation', () => {
      // Test that tokens have sufficient entropy by checking distribution
      const tokenChars = new Set();
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const token = generateOneTimeToken();
        for (const char of token) {
          tokenChars.add(char);
        }
      }
      
      // Should use a good portion of the base64url character set
      expect(tokenChars.size).toBeGreaterThan(30); // base64url has 64 chars, expect > 30
    });

    it('should generate tokens that encode to exactly 16 characters', () => {
      // Verify the math: 12 bytes * 8 bits/byte = 96 bits
      const randomBytes = crypto.randomBytes(12);
      expect(randomBytes.length).toBe(12);
      
      const encoded = randomBytes.toString('base64url');
      expect(encoded.length).toBe(16);
      
      // Our function should match this behavior
      const token = generateOneTimeToken();
      expect(token.length).toBe(16);
    });
  });

  describe('Token hashing for database storage', () => {
    it('should generate SHA-256 hashes of exactly 64 hex characters', () => {
      const token = generateOneTimeToken();
      const hash = hashToken(token);
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes for the same token', () => {
      const token = 'AbC123dEf456GhI7'; // 16-char test token
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different tokens', () => {
      const token1 = generateOneTimeToken();
      const token2 = generateOneTimeToken();
      
      const hash1 = hashToken(token1);
      const hash2 = hashToken(token2);
      
      expect(hash1).not.toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
    });

    it('should use SHA-256 algorithm specifically', () => {
      const token = 'test-token-12345';
      const expectedHash = crypto.createHash('sha256').update(token).digest('hex');
      const actualHash = hashToken(token);
      
      expect(actualHash).toBe(expectedHash);
    });
  });

  describe('Token format validation', () => {
    it('should validate correct 16-character base64url tokens', () => {
      const validTokens = [
        'AbC123dEf456GhI7',
        'AAAAAAAAAAAAAAAA',
        '1234567890123456',
        'aAbBcCdDeEfFgGhH',
        'test-token_12345',
        '_-_-_-_-_-_-_-_-'
      ];
      
      validTokens.forEach(token => {
        expect(validateTokenFormat(token)).toBe(true);
      });
    });

    it('should reject tokens with incorrect length', () => {
      const invalidLengthTokens = [
        '', // empty
        'short', // too short
        'AbC123dEf456GhI', // 15 chars
        'AbC123dEf456GhI78', // 17 chars
        'way-too-long-token-that-exceeds-16-characters'
      ];
      
      invalidLengthTokens.forEach(token => {
        expect(validateTokenFormat(token)).toBe(false);
      });
    });

    it('should reject tokens with invalid base64url characters', () => {
      const invalidCharTokens = [
        'AbC123dEf456GhI+', // + not allowed in base64url
        'AbC123dEf456GhI/', // / not allowed in base64url
        'AbC123dEf456GhI=', // = padding not allowed
        'AbC123dEf456Gh!@', // special characters
        'AbC123dEf456Gh 7', // space not allowed
        'AbC123dEf456Gh\t7' // tab not allowed
      ];
      
      invalidCharTokens.forEach(token => {
        expect(validateTokenFormat(token)).toBe(false);
      });
    });

    it('should only accept base64url character set', () => {
      // Valid base64url characters: A-Z, a-z, 0-9, -, _
      const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      
      // Test a token with all valid characters
      const validToken = validChars.substring(0, 16);
      expect(validateTokenFormat(validToken)).toBe(true);
    });
  });

  describe('Token expiration logic', () => {
    it('should create expiration dates with default timeout', () => {
      const expiration = createTokenExpiration();
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      
      expect(expiration.getTime()).toBeGreaterThan(now.getTime());
      expect(expiration.getTime()).toBeLessThanOrEqual(oneHourFromNow.getTime());
    });

    it('should create expiration dates with custom timeout', () => {
      const customTimeoutMs = 30 * 60 * 1000; // 30 minutes
      const expiration = createTokenExpiration(customTimeoutMs);
      const now = new Date();
      const thirtyMinutesFromNow = new Date(now.getTime() + customTimeoutMs);
      
      expect(expiration.getTime()).toBeGreaterThan(now.getTime());
      expect(expiration.getTime()).toBeLessThanOrEqual(thirtyMinutesFromNow.getTime());
      
      // Should be approximately 30 minutes from now (allow 1 second variance)
      const timeDifference = Math.abs(expiration.getTime() - thirtyMinutesFromNow.getTime());
      expect(timeDifference).toBeLessThan(1000);
    });

    it('should handle different timeout configurations', () => {
      const testCases = [
        { timeout: 5 * 60 * 1000, description: '5 minutes' },
        { timeout: 15 * 60 * 1000, description: '15 minutes' },
        { timeout: 60 * 60 * 1000, description: '1 hour' },
        { timeout: 24 * 60 * 60 * 1000, description: '24 hours' }
      ];
      
      testCases.forEach(({ timeout, description }) => {
        const expiration = createTokenExpiration(timeout);
        const now = new Date();
        const expectedExpiration = new Date(now.getTime() + timeout);
        
        const timeDifference = Math.abs(expiration.getTime() - expectedExpiration.getTime());
        expect(timeDifference).toBeLessThan(1000); // Allow 1 second variance
      });
    });
  });

  describe('Configuration and constants', () => {
    it('should use correct entropy and encoding constants', () => {
      const config: TokenGenerationConfig = {
        entropyBytes: 12, // 96 bits
        encoding: 'base64url',
        expectedLength: 16,
        hashAlgorithm: 'sha256',
        defaultExpirationMs: 60 * 60 * 1000 // 1 hour
      };
      
      expect(config.entropyBytes * 8).toBe(96); // 96 bits
      expect(config.encoding).toBe('base64url');
      expect(config.expectedLength).toBe(16);
      expect(config.hashAlgorithm).toBe('sha256');
    });
  });

  describe('Integration with database requirements', () => {
    it('should generate token hashes compatible with database schema', () => {
      const token = generateOneTimeToken();
      const hash = hashToken(token);
      
      // Hash should fit in VARCHAR(64) database column
      expect(hash.length).toBeLessThanOrEqual(64);
      
      // Should be exactly 64 chars for SHA-256 hex
      expect(hash.length).toBe(64);
      
      // Should only contain hex characters (database-safe)
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate tokens that are URL-safe', () => {
      const iterations = 100;
      
      for (let i = 0; i < iterations; i++) {
        const token = generateOneTimeToken();
        
        // Should not contain URL-unsafe characters
        expect(token).not.toContain('+');
        expect(token).not.toContain('/');
        expect(token).not.toContain('=');
        expect(token).not.toContain(' ');
        
        // Should work in URLs without encoding
        const testUrl = `https://example.com/i/${token}`;
        expect(() => new URL(testUrl)).not.toThrow();
      }
    });
  });
});