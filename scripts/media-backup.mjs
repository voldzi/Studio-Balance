// Run inside the production API image with the dedicated read-only S3 identity.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire("/app/apps/api/package.json");
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const root = "/backup";
const bucket = process.env.S3_BUCKET;
if (bucket !== "studio-balance-media") throw new Error("Unexpected backup bucket");
const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION || "us-east-1", forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }, maxAttempts: 3 });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const check = process.argv.includes("--check");
if (process.argv.includes("--restore-check")) {
  const latest = JSON.parse(await readFile(path.join(root, "latest.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(root, latest.directory, "manifest.json"), "utf8"));
  const entry = manifest.objects.find(object => object.key === "_checks/backup-restore-source.webp");
  if (!entry) throw new Error("Create and back up the dedicated restore probe first");
  const bytes = await readFile(path.join(root, latest.directory, entry.file));
  if (hash(bytes) !== entry.sha256) throw new Error("Backup checksum mismatch");
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: entry.key }));
  try { await client.send(new GetObjectCommand({ Bucket: bucket, Key: entry.key })); throw new Error("Deleted source remains available"); }
  catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; }
  const key = "_checks/backup-restore-copy-" + randomUUID() + ".webp";
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "image/webp" }));
    const restored = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (hash(await restored.Body.transformToByteArray()) !== entry.sha256) throw new Error("Restored object differs");
  } finally { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
  console.log(JSON.stringify({ service: "studio-balance-media-backup", restore: "passed", source: "off-storage-host backup", sha256: entry.sha256 }));
} else if (check) {
  const latest = JSON.parse(await readFile(path.join(root, "latest.json"), "utf8"));
  if (Date.now() - new Date(latest.completedAt).getTime() > 36 * 3600_000) throw new Error("Media backup older than 36 hours");
  const manifest = JSON.parse(await readFile(path.join(root, latest.directory, "manifest.json"), "utf8"));
  for (const entry of manifest.objects) {
    if (hash(await readFile(path.join(root, latest.directory, entry.file))) !== entry.sha256) throw new Error("Backup checksum mismatch");
  }
  console.log(JSON.stringify({ service: "studio-balance-media-backup", status: "ok", objectCount: manifest.objects.length, completedAt: latest.completedAt }));
} else {
  const directory = new Date().toISOString().replaceAll(":", "-") + "-" + randomUUID().slice(0, 8);
  const temporary = path.join(root, ".partial-" + directory);
  await mkdir(temporary, { mode: 0o700, recursive: true });
  const objects = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    objects.push(...(page.Contents || []));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const filesystem = await statfs(root);
  const bytesNeeded = objects.reduce((sum, entry) => sum + Number(entry.Size || 0), 0);
  if (Number(filesystem.bavail) * Number(filesystem.bsize) < bytesNeeded + 5 * 1024 ** 3) throw new Error("Insufficient space for backup plus 5 GiB reserve");
  const entries = [];
  for (const object of objects) {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }));
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    const digest = hash(bytes);
    const file = digest + ".bin";
    await writeFile(path.join(temporary, file), bytes, { mode: 0o600 });
    if ((await stat(path.join(temporary, file))).size !== bytes.length) throw new Error("Incomplete backup file");
    entries.push({ key: object.Key, file, sha256: digest, size: bytes.length, contentType: result.ContentType, versionId: result.VersionId });
  }
  const completedAt = new Date().toISOString();
  await writeFile(path.join(temporary, "manifest.json"), JSON.stringify({ bucket, completedAt, objects: entries }, null, 2), { mode: 0o600 });
  await rename(temporary, path.join(root, directory));
  const latestFile = path.join(root, ".latest-" + randomUUID() + ".json");
  await writeFile(latestFile, JSON.stringify({ directory, completedAt }), { mode: 0o600 });
  await rename(latestFile, path.join(root, "latest.json"));
  console.log(JSON.stringify({ service: "studio-balance-media-backup", status: "completed", objectCount: entries.length, bytes: bytesNeeded, directory, completedAt }));
}
