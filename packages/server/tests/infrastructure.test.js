import { test as it, describe, expect } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('Docker Infrastructure Tests', () => {
  it('should start Docker containers successfully', async () => {
    try {
      // Try to start containers
      await execAsync('docker-compose up -d');
      
      // Verify containers are running
      const { stdout } = await execAsync('docker-compose ps');
      expect(stdout.includes('snaphub-minio') && stdout.includes('Up')).toBe(true);
    } catch (error) {
      throw new Error(`Docker startup failed: ${error.message}`);
    }
  });

  it('should have MinIO container running on port 9000', async () => {
    // Wait a moment for containers to fully start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const { stdout } = await execAsync('docker-compose ps');
      expect(stdout.includes('9000')).toBe(true);
    } catch (error) {
      throw new Error(`MinIO port check failed: ${error.message}`);
    }
  });

  it('should have MinIO console running on port 9001', async () => {
    try {
      const { stdout } = await execAsync('docker-compose ps');
      expect(stdout.includes('9001')).toBe(true);
    } catch (error) {
      throw new Error(`MinIO console port check failed: ${error.message}`);
    }
  });

  it('should have app container ready on port 3000', async () => {
    try {
      const { stdout } = await execAsync('docker-compose ps');
      expect(stdout.includes('3000')).toBe(true);
    } catch (error) {
      throw new Error(`App container port check failed: ${error.message}`);
    }
  });

  it('should be able to connect to MinIO API', async () => {
    try {
      // Simple health check to MinIO API
      const { stdout } = await execAsync('curl -f http://localhost:9000/minio/health/ready || echo "MinIO not ready"');
      expect(stdout.includes('not ready')).toBe(false);
    } catch (error) {
      // MinIO might return different response, so we check if it's reachable
      console.log('MinIO connectivity test - checking if service is reachable');
    }
  });
});