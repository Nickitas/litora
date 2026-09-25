import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const candidates = [
  process.env.LITORA_ENV_FILE,
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), "../../.env.local"),
].filter((path): path is string => Boolean(path));

const envFile = candidates.find(existsSync);
if (envFile) dotenv.config({ path: envFile });

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Не задана обязательная переменная окружения ${name}`);
  return value;
}

export const environment = {
  port: Number(process.env.PORT ?? 3000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  apiOrigin: process.env.API_ORIGIN ?? "http://localhost:3000",
  secureCookies: process.env.COOKIE_SECURE === "true",
  cliDirectory: resolve(
    process.env.LITO_CLI_DIRECTORY ?? resolve(process.cwd(), "../lito-cli"),
  ),
  cliBinary: resolve(
    process.env.LITO_CLI_BINARY ??
      resolve(process.cwd(), "../lito-cli/bin/lito"),
  ),
  jobsDirectory: resolve(
    process.env.LITO_JOBS_DIRECTORY ??
      resolve(process.cwd(), "../../.litora/jobs"),
  ),
  jobTimeoutMs: Number(process.env.JOB_TIMEOUT_MS ?? 300000),
  databaseUrl: required("DATABASE_URL"),
  s3: {
    endpoint: required("S3_ENDPOINT"),
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? required("S3_ENDPOINT"),
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: required("S3_BUCKET"),
    accessKey: required("S3_ACCESS_KEY"),
    secretKey: required("S3_SECRET_KEY"),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    autoCreateBucket:
      process.env.S3_AUTO_CREATE_BUCKET === "true" ||
      (process.env.S3_AUTO_CREATE_BUCKET === undefined &&
        process.env.NODE_ENV !== "production"),
  },
};
