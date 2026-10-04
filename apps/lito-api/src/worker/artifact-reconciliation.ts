export interface ListedArtifact {
  key: string;
  lastModified: Date | undefined;
  etag: string | undefined;
}

export interface ReconciliationJob {
  id: string;
  status: string;
  finished_at: Date | null;
}

export interface CleanupCandidate extends ListedArtifact {
  jobId: string;
  hasMetadata: boolean;
}

export interface ReferencedArtifact {
  object_key: string;
  job_id: string;
  created_at: Date;
  status: string;
  finished_at: Date | null;
}

const jobKey = /^users\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/(.+)$/;

/** Возвращает UUID только для ключа результата job, не для входного dataset. */
export function jobIdFromArtifactKey(key: string): string | null {
  const match = jobKey.exec(key);
  if (!match || match[2].startsWith("datasets/")) return null;
  if (
    match[2].split("/").some((part) => !part || part === "." || part === "..") ||
    match[2].includes("\\")
  )
    return null;
  return match[1];
}

export function cleanupCandidate(
  object: ListedArtifact,
  job: ReconciliationJob | undefined,
  hasMetadata: boolean,
  cutoff: Date,
): CleanupCandidate | null {
  const jobId = jobIdFromArtifactKey(object.key);
  if (
    !jobId ||
    !job ||
    job.id !== jobId ||
    !["failed", "cancelled"].includes(job.status) ||
    !job.finished_at ||
    job.finished_at > cutoff ||
    !object.lastModified ||
    object.lastModified > cutoff ||
    !object.etag ||
    object.key === `users/${jobId}/failure.log`
  )
    return null;
  return { ...object, jobId, hasMetadata };
}

/** Сверяет только старые записи завершённых jobs; отсутствие подтверждается HEAD отдельно. */
export function possiblyMissingObject(
  artifact: ReferencedArtifact,
  listedKeys: ReadonlySet<string>,
  cutoff: Date,
): boolean {
  return (
    jobIdFromArtifactKey(artifact.object_key) === artifact.job_id &&
    !listedKeys.has(artifact.object_key) &&
    ["succeeded", "failed", "cancelled"].includes(artifact.status) &&
    artifact.finished_at !== null &&
    artifact.finished_at <= cutoff &&
    artifact.created_at <= cutoff
  );
}

export async function applyCleanupCandidate(
  candidate: CleanupCandidate,
  cutoff: Date,
  actions: {
    getJob: () => Promise<ReconciliationJob | undefined>;
    getMetadataOwner: () => Promise<string | undefined>;
    headObject: () => Promise<Pick<ListedArtifact, "etag" | "lastModified"> | undefined>;
    deleteObject: () => Promise<void>;
    removeMetadata: () => Promise<void>;
  },
): Promise<boolean> {
  if (jobIdFromArtifactKey(candidate.key) !== candidate.jobId) return false;
  const job = await actions.getJob();
  if (!cleanupCandidate(candidate, job, candidate.hasMetadata, cutoff))
    return false;
  const owner = await actions.getMetadataOwner();
  if (owner && owner !== candidate.jobId) return false;
  const current = await actions.headObject();
  if (
    !current ||
    current.etag !== candidate.etag ||
    current.lastModified?.getTime() !== candidate.lastModified?.getTime()
  )
    return false;
  await actions.deleteObject();
  await actions.removeMetadata();
  return true;
}
