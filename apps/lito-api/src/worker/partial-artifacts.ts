/** Удаляет только результаты, загруженные текущим запуском worker. */
export async function cleanupPartialArtifacts(
  jobId: string,
  objectKeys: ReadonlySet<string>,
  deleteObject: (key: string) => Promise<void>,
  removeMetadata: (jobId: string, key: string) => Promise<void>,
): Promise<string[]> {
  const prefix = `users/${jobId}/`;
  const keys = [...objectKeys];
  if (keys.some((key) => !key.startsWith(prefix) || key.length === prefix.length))
    throw new Error("Отказ в очистке: ключ вне каталога текущего расчёта");
  const failed: string[] = [];
  for (const key of keys) {
    try {
      await deleteObject(key);
      await removeMetadata(jobId, key);
    } catch {
      // Не удаляем metadata до успешного удаления S3-объекта.
      failed.push(key);
    }
  }
  return failed;
}
