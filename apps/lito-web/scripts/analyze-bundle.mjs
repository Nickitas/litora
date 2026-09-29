import { build } from "vite";
import { gzipSync } from "node:zlib";

// Собираем граф в памяти: отчёт не попадает в публичный dist и не раскрывает пути хоста.
await build({
  logLevel: "error",
  build: { write: false },
  plugins: [
    {
      name: "litora-bundle-analysis",
      generateBundle: {
        order: "post",
        handler(_options, bundle) {
          const chunks = Object.values(bundle).filter(
            (item) => item.type === "chunk"
          );
          const byFile = new Map(
            chunks.map((chunk) => [chunk.fileName, chunk])
          );
          const sizes = (chunk) => ({
            bytes: Buffer.byteLength(chunk.code),
            gzip: gzipSync(chunk.code).length,
          });
          const closure = (file, visited = new Set()) => {
            if (visited.has(file)) return visited;
            const chunk = byFile.get(file);
            if (!chunk) return visited;
            visited.add(file);
            for (const dependency of chunk.imports)
              closure(dependency, visited);
            return visited;
          };
          const entry = chunks.find((chunk) => chunk.isEntry);
          if (!entry) throw new Error("Не найден entry web-приложения");
          const totals = (files) =>
            [...files].reduce(
              (sum, file) => {
                const size = sizes(byFile.get(file));
                return {
                  bytes: sum.bytes + size.bytes,
                  gzip: sum.gzip + size.gzip,
                };
              },
              { bytes: 0, gzip: 0 }
            );
          const initial = closure(entry.fileName);
          const eagerDeferredModules = [...initial].flatMap((file) =>
            Object.entries(byFile.get(file).modules)
              .filter(
                ([id, module]) =>
                  module.renderedLength > 0 &&
                  /\/(motion|motion-dom|framer-motion)\/|\/src\/pages\/docs\//.test(
                    id
                  )
              )
              .map(([id]) =>
                id
                  .replace(/^.*\/node_modules\//, "")
                  .replace(/^.*\/src\//, "src/")
              )
          );
          const docsShell = chunks.find((chunk) =>
            chunk.facadeModuleId?.endsWith("/ui/docs-shell.tsx")
          );
          const report = {
            entry: { ...sizes(entry), staticGraph: totals(initial) },
            eagerDeferredModules,
            routes: chunks
              .filter(
                (chunk) =>
                  chunk.facadeModuleId?.includes("/src/pages/") &&
                  chunk.facadeModuleId.endsWith(".page.tsx")
              )
              .map((chunk) => ({
                name: chunk.name,
                chunk: sizes(chunk),
                withEntry: totals(
                  new Set([
                    ...initial,
                    ...closure(chunk.fileName),
                    ...(docsShell &&
                    chunk.facadeModuleId.includes("/pages/docs/")
                      ? closure(docsShell.fileName)
                      : []),
                  ])
                ),
              })),
            entryModules: Object.entries(entry.modules)
              .sort((a, b) => b[1].renderedLength - a[1].renderedLength)
              .slice(0, 12)
              .map(([id, module]) => ({
                name: id
                  .replaceAll("\\", "/")
                  .split("/node_modules/")
                  .pop()
                  .replace(/^.*\/src\//, "src/"),
                renderedBytes: module.renderedLength,
              })),
          };
          console.log(JSON.stringify(report, null, 2));
          if (process.argv.includes("--check") && eagerDeferredModules.length) {
            this.error("Motion или docs вернулись в статический граф entry");
          }
          if (
            process.argv.includes("--check") &&
            report.entry.staticGraph.bytes > 400000
          ) {
            this.error(
              "Статический JS-граф entry превышает бюджет 400 000 байт"
            );
          }
        },
      },
    },
  ],
});
