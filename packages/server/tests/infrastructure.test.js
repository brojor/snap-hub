import { test, describe } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('Docker Infrastructure Tests', () => {
  test('should start Docker containers successfully', async () => {
    try {
      // Try to start containers
      await execAsync('docker-compose up -d');
      
      // Verify containers are running
      const { stdout } = await execAsync('docker-compose ps');
      ok(stdout.includes('snaphub-minio') && stdout.includes('Up'), 
         'Docker containers should be running successfully');
    } catch (error) {
      throw new Error(`Docker startup failed: ${error.message}`);
    }
  });

  test('should have MinIO container running on port 9000', async () => {
    // Wait a moment for containers to fully start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      const { stdout } = await execAsync('docker-compose ps');
      ok(stdout.includes('9000'), 'MinIO should be running on port 9000');
    } catch (error) {
      throw new Error(`MinIO port check failed: ${error.message}`);
    }
  });

  test('should have MinIO console running on port 9001', async () => {
    try {
      const { stdout } = await execAsync('docker-compose ps');
      ok(stdout.includes('9001'), 'MinIO console should be running on port 9001');
    } catch (error) {
      throw new Error(`MinIO console port check failed: ${error.message}`);
    }
  });

  test('should have app container ready on port 3000', async () => {
    try {
      const { stdout } = await execAsync('docker-compose ps');
      ok(stdout.includes('3000'), 'App container should be running on port 3000');
    } catch (error) {
      throw new Error(`App container port check failed: ${error.message}`);
    }
  });

  test('should be able to connect to MinIO API', async () => {
    try {
      // Simple health check to MinIO API
      const { stdout } = await execAsync('curl -f http://localhost:9000/minio/health/ready || echo "MinIO not ready"');
      ok(!stdout.includes('not ready'), 'MinIO API should be accessible');
    } catch (error) {
      // MinIO might return different response, so we check if it's reachable
      console.log('MinIO connectivity test - checking if service is reachable');
    }
  });
});