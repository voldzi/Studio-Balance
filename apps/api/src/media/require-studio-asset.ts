import { HttpException, HttpStatus } from "@nestjs/common";
import type { PoolClient } from "pg";

export async function requireStudioAsset(client: PoolClient, id: string | null | undefined) {
  if (!id) return;
  const result = await client.query("SELECT id FROM media_assets WHERE id=$1 AND storage_key LIKE 'studio/%' FOR SHARE", [id]);
  if (!result.rowCount) throw new HttpException({ code: "VALIDATION_ERROR", message: "Vyberte fotografii nahranou pro instruktory nebo tým studia." }, HttpStatus.BAD_REQUEST);
}
