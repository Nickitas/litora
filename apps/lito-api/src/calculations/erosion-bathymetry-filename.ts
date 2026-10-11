/** Допустимое исходное имя JSON батиметрии, сохраняемое рядом с паспортом Go. */
export function isErosionBathymetryFilename(filename: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,99}\.json$/i.test(filename);
}
