import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
const app = new Hono();
// Initialize MinIO S3 client
const s3Client = new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || 9000}`,
    region: 'us-east-1', // MinIO requires a region but ignores it
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || 'admin',
        secretAccessKey: process.env.MINIO_SECRET_KEY || 'password123',
    },
    forcePathStyle: true, // Required for MinIO
});
const BUCKET_NAME = process.env.MINIO_BUCKET || 'snaphub-test';
// File validation helper
const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
app.get('/', (c) => {
    return c.json({
        message: 'SnapHub MinIO Test Upload - Server Running',
        timestamp: new Date().toISOString()
    });
});
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        service: 'snaphub-minio-test',
        timestamp: new Date().toISOString()
    });
});
// Upload endpoint
app.post('/upload', async (c) => {
    try {
        const contentType = c.req.header('content-type');
        if (!contentType || !contentType.includes('multipart/form-data')) {
            return c.json({ success: false, error: 'Invalid content type' }, 400);
        }
        const body = await c.req.parseBody();
        const file = body.file;
        if (!file || !(file instanceof File)) {
            return c.json({ success: false, error: 'No file provided' }, 400);
        }
        // Validate file type
        if (!allowedMimeTypes.includes(file.type)) {
            return c.json({ success: false, error: 'Invalid file type' }, 400);
        }
        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            return c.json({ success: false, error: 'File too large' }, 400);
        }
        // Generate unique filename
        const timestamp = Date.now();
        const filename = `${timestamp}-${file.name}`;
        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const fileBuffer = Buffer.from(arrayBuffer);
        // Upload to MinIO
        const uploadCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: filename,
            Body: fileBuffer,
            ContentType: file.type,
            Metadata: {
                originalname: file.name,
                uploadDate: new Date().toISOString(),
            },
        });
        await s3Client.send(uploadCommand);
        return c.json({
            success: true,
            message: 'File uploaded successfully',
            filename: filename,
        });
    }
    catch (error) {
        console.error('Upload error:', error);
        return c.json({
            success: false,
            error: 'Upload failed'
        }, 500);
    }
});
// Files listing endpoint
app.get('/files', async (c) => {
    try {
        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
        });
        const response = await s3Client.send(listCommand);
        if (!response.Contents) {
            return c.json({ files: [] });
        }
        // Transform S3 objects to our format
        const files = response.Contents.map(object => ({
            filename: object.Key,
            size: object.Size,
            uploadDate: object.LastModified.toISOString(),
        }));
        // Sort by upload date (newest first)
        files.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());
        return c.json({ files });
    }
    catch (error) {
        console.error('Files listing error:', error);
        return c.json({
            error: 'Failed to retrieve files'
        }, 500);
    }
});
const port = process.env.PORT || 3000;
console.log(`🚀 SnapHub MinIO Test server starting on port ${port}`);
// Start the server using Hono's Node.js adapter
console.log(`✅ Server listening on port ${port}`);
serve({
    fetch: app.fetch,
    port: Number(port)
});
