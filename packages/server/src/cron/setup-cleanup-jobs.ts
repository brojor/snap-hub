import { CronJob } from 'cron';
import { cleanupExpiredTokensAndSessions } from '../scripts/cleanup-expired-tokens.js';

/**
 * Setup automated cleanup jobs using cron
 * This should be called when the server starts
 */
export function setupCleanupJobs() {
  console.log('📅 Setting up automated cleanup jobs...');

  // Daily cleanup at 2:30 AM
  const dailyCleanupJob = new CronJob(
    '30 2 * * *', // Every day at 2:30 AM
    async () => {
      console.log('\n🕐 Running scheduled cleanup at:', new Date().toISOString());
      try {
        const stats = await cleanupExpiredTokensAndSessions();
        console.log('✅ Scheduled cleanup completed successfully');
        console.log('📊 Cleanup stats:', stats);
      } catch (error) {
        console.error('❌ Scheduled cleanup failed:', error);
      }
    },
    null, // onComplete
    false, // start (will be started manually)
    'UTC', // timezone
    null, // context
    false // runOnInit
  );

  // Hourly session cleanup (more frequent for sessions as they might have shorter expiry)
  const hourlySessionCleanupJob = new CronJob(
    '0 * * * *', // Every hour at minute 0
    async () => {
      console.log('\n🕐 Running hourly session cleanup at:', new Date().toISOString());
      try {
        // Only clean sessions in hourly job to reduce load
        const stats = await cleanupExpiredTokensAndSessions();
        if (stats.expiredSessions > 0) {
          console.log(`✅ Cleaned up ${stats.expiredSessions} expired sessions`);
        }
      } catch (error) {
        console.error('❌ Hourly session cleanup failed:', error);
      }
    },
    null, // onComplete
    false, // start
    'UTC', // timezone
    null, // context
    false // runOnInit
  );

  // Start the cron jobs
  dailyCleanupJob.start();
  hourlySessionCleanupJob.start();

  console.log('✅ Cleanup jobs scheduled:');
  console.log('   - Daily full cleanup: 2:30 AM UTC');
  console.log('   - Hourly session cleanup: Every hour at :00');

  // Return jobs for potential management (start/stop/etc.)
  return {
    dailyCleanupJob,
    hourlySessionCleanupJob,
    
    // Utility methods
    stop: () => {
      dailyCleanupJob.stop();
      hourlySessionCleanupJob.stop();
      console.log('🛑 Cleanup jobs stopped');
    },
    
    restart: () => {
      dailyCleanupJob.start();
      hourlySessionCleanupJob.start();
      console.log('🔄 Cleanup jobs restarted');
    },
    
    // Manual trigger for testing
    runCleanupNow: async () => {
      console.log('🚀 Manually triggering cleanup...');
      return await cleanupExpiredTokensAndSessions();
    }
  };
}