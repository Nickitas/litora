import type { CalculationArtifactDto } from "@litora/contracts";

const previewableImageTypes = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function isPreviewableImage(file: CalculationArtifactDto) {
  return (
    file.category === "output" &&
    previewableImageTypes.has(
      file.contentType.split(";", 1)[0].trim().toLowerCase()
    )
  );
}
