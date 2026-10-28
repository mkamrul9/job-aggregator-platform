import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { StorageService, MAX_UPLOAD_BYTES } from './storage.service';
import * as fs from 'fs';
import * as path from 'path';

describe('StorageService', () => {
  let service: StorageService;
  const testStorageDir = path.join(process.cwd(), 'data', 'test-storage');

  beforeAll(() => {
    process.env.OBJECT_STORAGE_DIR = testStorageDir;
    service = new StorageService();
  });

  afterAll(async () => {
    try {
      await fs.promises.rm(testStorageDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error if directory does not exist
    }
  });

  describe('validatePdfBuffer', () => {
    it('accepts valid PDF buffer starting with %PDF', () => {
      const validPdf = Buffer.from('%PDF-1.4 Minimal PDF');
      expect(() => service.validatePdfBuffer(validPdf)).not.toThrow();
    });

    it('rejects empty buffer', () => {
      expect(() => service.validatePdfBuffer(Buffer.alloc(0))).toThrow(
        BadRequestException,
      );
    });

    it('rejects file without %PDF magic bytes signature', () => {
      const fakePdf = Buffer.from('GIF89a Fake Image');
      expect(() => service.validatePdfBuffer(fakePdf)).toThrow(
        BadRequestException,
      );
    });

    it('rejects buffer exceeding 10MB limit', () => {
      // 10MB + 1 byte
      const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
      oversized.write('%PDF', 0, 4, 'ascii');
      expect(() => service.validatePdfBuffer(oversized)).toThrow(
        PayloadTooLargeException,
      );
    });
  });

  describe('putObject, getObject, deleteObject', () => {
    it('rejects path traversal keys', async () => {
      const validPdf = Buffer.from('%PDF-1.4 data');
      await expect(
        service.putObject('../../../etc/passwd', validPdf),
      ).rejects.toThrow(BadRequestException);

      await expect(service.getObject('../secret.txt')).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.deleteObject('../../danger')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('persists, reads, and deletes private storage object atomically', async () => {
      const key = 'resumes/usr_test_1/doc_sample.pdf';
      const pdfBytes = Buffer.from('%PDF-1.4 Valid candidate CV bytes');

      await service.putObject(key, pdfBytes);

      const retrieved = await service.getObject(key);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.toString('utf-8')).toBe(pdfBytes.toString('utf-8'));

      const checksum = service.computeChecksumSha256(pdfBytes);
      expect(checksum).toHaveLength(64);

      const deleted = await service.deleteObject(key);
      expect(deleted).toBe(true);

      const afterDelete = await service.getObject(key);
      expect(afterDelete).toBeNull();
    });
  });
});
