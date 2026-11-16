import "@fastify/multipart";
import { HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

const fileLimit = 850 * 1024;

export async function readWebsitePhoto(request: FastifyRequest): Promise<Buffer> {
  if (!request.isMultipart()) throw invalid();
  let photo: Buffer | undefined;
  try {
    for await (const part of request.parts({
      limits: { fields: 0, files: 1, parts: 2, fileSize: fileLimit + 1, headerPairs: 20 }
    })) {
      if (part.type !== "file" || part.fieldname !== "file" || photo) throw invalid();
      photo = await part.toBuffer();
    }
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") throw tooLarge();
    throw invalid();
  }
  if (!photo?.length) throw invalid();
  if (photo.length > fileLimit) throw tooLarge();
  return photo;
}

function invalid() {
  return new HttpException({ code:"INVALID_IMAGE", message:"Nahrajte jednu platnou fotografii JPG, PNG nebo WebP." }, HttpStatus.BAD_REQUEST);
}
function tooLarge() {
  return new HttpException({ code:"IMAGE_TOO_LARGE", message:"Fotografie je po zmenšení stále příliš velká." }, HttpStatus.PAYLOAD_TOO_LARGE);
}
