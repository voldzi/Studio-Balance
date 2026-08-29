import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import sharp from "sharp";

import { RuntimeConfigService } from "../config/runtime-config.js";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

@Injectable()
export class MediaStorageService {
  private readonly client?: S3Client;

  constructor(@Inject(RuntimeConfigService) private readonly config: RuntimeConfigService) {
    const storage = config.value.mediaStorage;
    if (storage) {
      this.client = new S3Client({
        endpoint: storage.endpoint,
        forcePathStyle: storage.forcePathStyle,
        region: storage.region,
        credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey }
      });
    }
  }

  isConfigured(): boolean { return Boolean(this.client && this.config.value.mediaStorage); }

  async prepareImage(input: Buffer): Promise<{ body: Buffer; contentType: "image/webp"; height: number; width: number }> {
    if (!input.length || input.length > MAX_UPLOAD_BYTES) throw invalidImage();
    try {
      const body = await sharp(input, { failOn: "warning", limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86, effort: 4 })
        .toBuffer();
      const metadata = await sharp(body).metadata();
      if (!metadata.width || !metadata.height) throw new Error("Missing dimensions");
      return { body, contentType: "image/webp", width: metadata.width, height: metadata.height };
    } catch {
      throw invalidImage();
    }
  }

  async put(key: string, body: Buffer): Promise<void> {
    const { client, storage } = this.required();
    await client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body, ContentType: "image/webp", CacheControl: "public, max-age=31536000, immutable" }));
  }

  async get(key: string): Promise<Uint8Array> {
    const { client, storage } = this.required();
    const result = await client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: key }));
    if (!result.Body) throw new HttpException({ code: "RESOURCE_NOT_FOUND", message: "Fotografie nebyla nalezena." }, HttpStatus.NOT_FOUND);
    return result.Body.transformToByteArray();
  }

  async remove(key: string): Promise<void> {
    const { client, storage } = this.required();
    await client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }));
  }

  private required() {
    const storage = this.config.value.mediaStorage;
    if (!this.client || !storage) {
      throw new HttpException({ code: "MEDIA_STORAGE_UNAVAILABLE", message: "Úložiště fotografií ještě není pro Studio Balance aktivované." }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { client: this.client, storage };
  }
}

function invalidImage() {
  return new HttpException({ code: "INVALID_IMAGE", message: "Nahrajte platnou fotografii JPG, PNG nebo WebP do 8 MB." }, HttpStatus.BAD_REQUEST);
}
