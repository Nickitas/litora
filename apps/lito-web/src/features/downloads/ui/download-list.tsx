import { useEffect, useState } from "react";
import { createApiClient } from "@litora/api-client";
import { downloadsApi, type DownloadFile } from "@/shared/api";
import { DownloadCard } from "./download-card";

export function DownloadList() {
  const [files, setFiles] = useState<DownloadFile[]>(downloadsApi);

  useEffect(() => {
    void createApiClient().releases().then((release) => {
      if (release.files.length > 0) {
        setFiles(release.files.map((file) => ({
          ...file,
          os: file.platform,
          requirements: "",
          goVersion: "Go 1.23+",
          releaseDate: release.releaseDate,
          changelog: release.changelog,
        })));
      }
    }).catch(() => undefined);
  }, []);

  const handleDownload = (file: DownloadFile) => {
    console.log("Downloading file:", file.url, file.name);
    const link = document.createElement("a");
    link.href = file.url;
    link.download = file.name;
    link.target = "_blank";
    link.setAttribute("download", file.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <DownloadCard key={file.id} file={file} onDownload={handleDownload} />
      ))}
    </div>
  );
}
