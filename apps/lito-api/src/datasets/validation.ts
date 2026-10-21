import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { DatasetInputError, parseCreateDataset, smallDatasetLimits, type CreateDatasetDto } from "@litora/contracts";

export const maxDatasetBytes = smallDatasetLimits.maxBytes;
export const maxDatasetPoints = smallDatasetLimits.maxPoints;
export const maxDatasetsPerUser = smallDatasetLimits.maxPerUser;

export function validateDataset(body: unknown): { dataset: CreateDatasetDto; bytes: Buffer } {
  try {
    const dataset = parseCreateDataset(body);
    return { dataset, bytes: Buffer.from(JSON.stringify(dataset.geometry), "utf8") };
  } catch (error) {
    if (error instanceof DatasetInputError) {
      if (error.status === 413) throw new PayloadTooLargeException(error.message);
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
