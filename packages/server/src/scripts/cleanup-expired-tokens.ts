#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { oneTimeTokens, sessions } from '../db/schema/index.js';
import { lt, sql } from 'drizzle-orm';

/**
 * Cleanup script for expired one-time tokens and sessions
 * This script should be run periodically (e.g., via cron job)
 */
export async function cleanupExpiredTokensAndSessions() {
  const client = postgres({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'snaphub',
    database: process.env.DB_NAME || 'postgres',
  });

  const db = drizzle(client);

  try {
    console.log('🧹 Starting cleanup of expired tokens and sessions...');
    const now = new Date();

    // Cleanup expired one-time tokens
    console.log('🔑 Cleaning up expired one-time tokens...');
    const expiredTokensResult = await db
      .delete(oneTimeTokens)
      .where(lt(oneTimeTokens.expiresAt, now));
    
    console.log(`   ✓ Removed ${expiredTokensResult.rowCount || 0} expired tokens`);

    // Cleanup expired sessions
    console.log('🔐 Cleaning up expired sessions...');
    const expiredSessionsResult = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now));
    
    console.log(`   ✓ Removed ${expiredSessionsResult.rowCount || 0} expired sessions`);

    // Optional: Cleanup very old used tokens (older than 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    console.log('🗑️  Cleaning up old used tokens (>30 days)...');
    const oldUsedTokensResult = await db
      .delete(oneTimeTokens)
      .where(
        sql`${oneTimeTokens.usedAt} IS NOT NULL AND ${oneTimeTokens.usedAt} < ${thirtyDaysAgo}`
      );
    
    console.log(`   ✓ Removed ${oldUsedTokensResult.rowCount || 0} old used tokens`);

    console.log('✅ Cleanup completed successfully');
    
    return {
      expiredTokens: expiredTokensResult.rowCount || 0,
      expiredSessions: expiredSessionsResult.rowCount || 0,
      oldUsedTokens: oldUsedTokensResult.rowCount || 0,
    };
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run cleanup if script is called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupExpiredTokensAndSessions()
    .then((stats) => {
      console.log('\n📊 Cleanup Statistics:');
      console.log(`   - Expired tokens removed: ${stats.expiredTokens}`);
      console.log(`   - Expired sessions removed: ${stats.expiredSessions}`);
      console.log(`   - Old used tokens removed: ${stats.oldUsedTokens}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Cleanup failed:', error);
      process.exit(1);
    });
}