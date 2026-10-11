import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { isErosionBathymetryFilename } from "../calculations/erosion-bathymetry-filename.js";

/** Подготавливает проверяемую Go пару JSON/паспорта, не используя путь из запроса. */
export async function stageErosionBathymetry(
  directory: string,
  dataPath: string,
  metadataPath: string,
  originalFilename: string,
): Promise<string> {
  if (!isErosionBathymetryFilename(originalFilename))
    throw new Error("Имя батиметрии для CERC должно быть простым именем .json без пути");
  const stage = join(directory, "erosion-inputs");
  await mkdir(stage, { recursive: false, mode: 0o700 });
  const bathymetryPath = join(stage, originalFilename);
  const passportPath = join(stage, originalFilename.replace(/\.json$/i, ".metadata.json"));
  await rename(dataPath, bathymetryPath);
  await rename(metadataPath, passportPath);
  return bathymetryPath;
}
