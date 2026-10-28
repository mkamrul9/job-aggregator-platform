import {
  Injectable,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB limit

@Injectable()
export class StorageService {
  private readonly storageRoot: string;

  constructor() {
    this.storageRoot = path.resolve(
      process.env.OBJECT_STORAGE_DIR ||
        path.join(process.cwd(), 'data', 'storage'),
    );
    try {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    } catch {
      // Root exists or read-only volume
    }
  }

  /**
   * Resolves a key within the isolated storage root, rejecting path traversal attempts.
   */
  private resolveSafePath(key: string): string {
    const sanitizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(this.storageRoot, sanitizedKey);
    if (!resolved.startsWith(this.storageRoot)) {
      throw new BadRequestException(
        'Invalid storage key: path traversal detected',
      );
    }
    return resolved;
  }

  /**
   * Validates file size and magic bytes (%PDF header).
   */
  validatePdfBuffer(buffer: Buffer): void {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Uploaded file is empty');
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('File size exceeds the 10MB limit');
    }
    const signature = buffer.subarray(0, 4).toString('ascii');
    if (signature !== '%PDF') {
      throw new BadRequestException(
        'Invalid PDF file signature: document must start with %PDF',
      );
    }
  }

  computeChecksumSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Persists an object buffer to private storage under a server-controlled opaque key.
   */
  async putObject(key: string, buffer: Buffer): Promise<void> {
    this.validatePdfBuffer(buffer);
    const targetPath = this.resolveSafePath(key);
    const parentDir = path.dirname(targetPath);
    await fs.promises.mkdir(parentDir, { recursive: true });

    // Atomic write via temp file
    const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    await fs.promises.writeFile(tempPath, buffer);
    await fs.promises.rename(tempPath, targetPath);
  }

  /**
   * Retrieves an object buffer by key.
   */
  async getObject(key: string): Promise<Buffer | null> {
    const targetPath = this.resolveSafePath(key);
    try {
      return await fs.promises.readFile(targetPath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Deletes an object by key.
   */
  async deleteObject(key: string): Promise<boolean> {
    const targetPath = this.resolveSafePath(key);
    try {
      await fs.promises.unlink(targetPath);
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }
}
