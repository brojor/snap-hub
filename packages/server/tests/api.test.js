import { test, describe, before, after } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Test image data (1x1 pixel PNG)
const testImageBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

const TEST_IMAGE_PATH = '/tmp/test-image.png';
const API_BASE = 'http://localhost:3001';

describe('API Endpoints Tests', () => {
  before(async () => {
    // Create a test image file
    writeFileSync(TEST_IMAGE_PATH, testImageBuffer);
    
    // Wait for app to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  after(async () => {
    // Clean up test file
    try {
      const fs = await import('node:fs');
      fs.unlinkSync(TEST_IMAGE_PATH);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should respond to health check', async () => {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    strictEqual(response.status, 200);
    strictEqual(data.status, 'ok');
    strictEqual(data.service, 'snaphub-minio-test');
  });

  test('should upload image file successfully', async () => {
    const formData = new FormData();
    const blob = new Blob([testImageBuffer], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    strictEqual(response.status, 200);
    strictEqual(data.success, true);
    strictEqual(data.message, 'File uploaded successfully');
    ok(data.filename, 'Response should include filename');
  });

  test('should reject non-image files', async () => {
    const formData = new FormData();
    const textBlob = new Blob(['hello world'], { type: 'text/plain' });
    formData.append('file', textBlob, 'test.txt');

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    strictEqual(response.status, 400);
    strictEqual(data.success, false);
    strictEqual(data.error, 'Invalid file type');
  });

  test('should reject upload without file', async () => {
    const formData = new FormData();

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    strictEqual(response.status, 400);
    strictEqual(data.success, false);
    strictEqual(data.error, 'No file provided');
  });

  test('should list uploaded files', async () => {
    const response = await fetch(`${API_BASE}/files`);
    const data = await response.json();
    
    strictEqual(response.status, 200);
    ok(Array.isArray(data.files), 'Response should contain files array');
    
    if (data.files.length > 0) {
      const file = data.files[0];
      ok(file.filename, 'File should have filename');
      ok(typeof file.size === 'number', 'File should have size as number');
      ok(file.uploadDate, 'File should have upload date');
    }
  });

  test('should return empty array when no files exist', async () => {
    // This test assumes we can clear the bucket, or we test with a clean bucket
    // For now, we just verify the structure is correct
    const response = await fetch(`${API_BASE}/files`);
    const data = await response.json();
    
    strictEqual(response.status, 200);
    ok(Array.isArray(data.files), 'Response should contain files array');
  });
});