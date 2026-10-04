import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const content = join(root, "packages/docs/content");
const sdd = join(root, "sdd");
const maintenance = join(root, "todo/maintenance.md");
const web = join(root, "apps/lito-web");

// Linux checkout ограничивает каждый компонент пути 255 байтами, не символами.
const trackedPaths = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root },
).toString("utf8");
for (const filename of trackedPaths.split("\0").filter(Boolean)) {
  for (const component of filename.split("/")) {
    assert.ok(
      Buffer.byteLength(component, "utf8") <= 255,
      `${filename}: компонент пути длиннее 255 байт для Linux checkout`,
    );
  }
}

function filesIn(directory, skip = new Set()) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = join(directory, entry.name);
    if (entry.isDirectory())
      return skip.has(entry.name) ? [] : filesIn(filename, skip);
    return entry.isFile() ? [filename] : [];
  });
}

const packageManager = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  .packageManager;
assert.match(packageManager, /^pnpm@\d+\.\d+\.\d+$/);

const skipped = new Set(["node_modules", "dist", "output", "bin", ".github"]);
assert.ok(existsSync(join(root, "pnpm-lock.yaml")), "Нет корневого pnpm-lock.yaml");
const locks = [
  join(root, "pnpm-lock.yaml"),
  ...filesIn(join(root, "apps"), skipped),
  ...filesIn(join(root, "packages"), skipped),
].filter((filename) =>
  ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].some((name) =>
    filename.endsWith(`/${name}`)
  )
);
assert.deepEqual(
  locks.map((filename) => relative(root, filename)).sort(),
  ["pnpm-lock.yaml"],
  "В монорепозитории должен быть только один lockfile в корне"
);

const workflows = filesIn(join(root, ".github/workflows"))
  .filter((filename) => /\.ya?ml$/.test(filename))
  .map((filename) => relative(join(root, ".github/workflows"), filename));
assert.deepEqual(workflows, ["ci.yml"], "Нужен ровно один корневой workflow ci.yml");

for (const app of readdirSync(join(root, "apps"), { withFileTypes: true })) {
  if (!app.isDirectory()) continue;
  assert.ok(
    !existsSync(join(root, "apps", app.name, ".github/workflows")),
    `Вложенный CI приложения ${app.name} не запускается GitHub; используйте корневой workflow`
  );
}

const components = JSON.parse(readFileSync(join(web, "components.json"), "utf8"));
assert.ok(
  existsSync(join(web, components.tailwind.css)),
  "Путь tailwind.css в components.json не существует"
);

assert.ok(!existsSync(join(content, "sdd")), "SDD не должна находиться в пакете сайта");
assert.ok(existsSync(maintenance), "План развития должен находиться в todo/maintenance.md");
const sddDocuments = filesIn(sdd).filter((filename) => filename.endsWith(".md"));
const siteDocuments = filesIn(content).filter((filename) => filename.endsWith(".md"));
assert.ok(sddDocuments.length >= 7 && siteDocuments.length >= 20);

for (const filename of siteDocuments) {
  const source = readFileSync(filename, "utf8");
  assert.ok(!/\]\([^)]*\bsdd\//.test(source), `${filename}: ссылка на внутренний SDD`);
}

let checkedLinks = 0;
for (const filename of [
  ...sddDocuments,
  maintenance,
  join(root, "AGENTS.md"),
  join(root, "README.md"),
]) {
  const markdown = readFileSync(filename, "utf8");
  const prose = markdown.replace(/```[^\n]*\n[\s\S]*?```/g, "");
  for (const match of prose.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].split("#")[0];
    if (!href || /^(https?:|mailto:)/.test(href)) continue;
    const target = resolve(dirname(filename), decodeURI(href));
    assert.ok(existsSync(target), `${relative(root, filename)}: нет ${href}`);
    if (filename.startsWith(`${sdd}/`))
      assert.ok(
        target !== content && !target.startsWith(`${content}${sep}`),
        `${relative(root, filename)}: SDD не должна импортировать документы сайта`
      );
    checkedLinks++;
  }
}

console.log(
  `Монорепозиторий: один lockfile, один CI, ${sddDocuments.length} SDD-документов, ${siteDocuments.length} документов сайта, ${checkedLinks} ссылок — OK.`
);

await import("./check-cli-capabilities.mjs");
