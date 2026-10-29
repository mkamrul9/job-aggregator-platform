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
      if (!fs.existsSync(this.storageRoot)) {
        fs.mkdirSync(this.storageRoot, { recursive: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to initialize private storage root at ${this.storageRoot}: ${msg}`,
      );
    }
  }

  /**
   * Resolves a key within the isolated storage root, rejecting path traversal and sibling escapes.
   */
  resolveSafePath(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('Storage key must be a non-empty string');
    }

    // 1. Enforce strict key grammar (alphanumeric, underscores, hyphens, dots, slashes)
    if (!/^[a-zA-Z0-9_\-./]+$/.test(key)) {
      throw new BadRequestException(
        'Invalid storage key: illegal characters detected',
      );
    }

    // 2. Reject path segment traversal ('..' or '.')
    const segments = key.split(/[/\\]/);
    if (segments.some((seg) => seg === '..' || seg === '.')) {
      throw new BadRequestException(
        'Invalid storage key: directory traversal segments not permitted',
      );
    }

    // 3. Reject absolute keys
    if (path.isAbsolute(key) || /^[a-zA-Z]:/.test(key)) {
      throw new BadRequestException(
        'Invalid storage key: absolute paths not permitted',
      );
    }

    const sanitizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const resolved = path.resolve(this.storageRoot, sanitizedKey);

    // 4. Strict directory containment checking separator boundary to prevent sibling-prefix escape
    const rootWithSep = this.storageRoot.endsWith(path.sep)
      ? this.storageRoot
      : this.storageRoot + path.sep;

    if (resolved !== this.storageRoot && !resolved.startsWith(rootWithSep)) {
      throw new BadRequestException(
        'Invalid storage key: path traversal detected',
      );
    }

    // 5. If file exists, verify realpath does not escape root (symlink defense)
    if (fs.existsSync(resolved)) {
      const real = fs.realpathSync(resolved);
      if (real !== this.storageRoot && !real.startsWith(rootWithSep)) {
        throw new BadRequestException(
          'Invalid storage key: symlink traversal detected',
        );
      }
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
