/** Указывает UTF-8 только для текстовых HTTP-артефактов, сохраняя базовый MIME в DTO. */
export function artifactContentType(contentType: string): string {
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  const text = mediaType.startsWith("text/") ||
    ["application/json", "application/geo+json", "application/xml", "image/svg+xml"].includes(mediaType);
  return text && !/;\s*charset\s*=/i.test(contentType)
    ? `${contentType}; charset=utf-8` : contentType;
}
