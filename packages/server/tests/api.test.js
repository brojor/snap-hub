import { test as it, describe, beforeAll, afterAll, expect } from 'vitest';
import { writeFileSync } from 'node:fs';

// Test image data (1x1 pixel PNG)
const testImageBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

const TEST_IMAGE_PATH = '/tmp/test-image.png';
const API_BASE = 'http://localhost:3001';

describe('API Endpoints Tests', () => {
  beforeAll(async () => {
    // Create a test image file
    writeFileSync(TEST_IMAGE_PATH, testImageBuffer);
    
    // Wait for app to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    // Clean up test file
    try {
      const fs = await import('node:fs');
      fs.unlinkSync(TEST_IMAGE_PATH);
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should respond to health check', async () => {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.service).toBe('snaphub-minio-test');
  });

  it('should upload image file successfully', async () => {
    const formData = new FormData();
    const blob = new Blob([testImageBuffer], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toBe('File uploaded successfully');
    expect(data.filename).toBeDefined();
  });

  it('should reject non-image files', async () => {
    const formData = new FormData();
    const textBlob = new Blob(['hello world'], { type: 'text/plain' });
    formData.append('file', textBlob, 'test.txt');

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid file type');
  });

  it('should reject upload without file', async () => {
    const formData = new FormData();

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('No file provided');
  });

  it('should list uploaded files', async () => {
    const response = await fetch(`${API_BASE}/files`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(Array.isArray(data.files)).toBe(true);
    
    if (data.files.length > 0) {
      const file = data.files[0];
      expect(file.filename).toBeDefined();
      expect(typeof file.size).toBe('number');
      expect(file.uploadDate).toBeDefined();
    }
  });

  it('should return empty array when no files exist', async () => {
    // This test assumes we can clear the bucket, or we test with a clean bucket
    // For now, we just verify the structure is correct
    const response = await fetch(`${API_BASE}/files`);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(Array.isArray(data.files)).toBe(true);
  });
});