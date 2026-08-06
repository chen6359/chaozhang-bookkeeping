import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("../app/", import.meta.url));

const blockedClientCopy = [
  { label: "双币种独立记录", pattern: /双币种独立记录/u },
  {
    label: "方案 A/B",
    pattern: /(?:方案\s*[ABＡＢ]|[ABＡＢ]\s*方案)/iu,
  },
  { label: "问题证据", pattern: /问题证据/u },
  { label: "不再作为交付", pattern: /不再作为交付/u },
  {
    label: "可修改可删除",
    pattern: /可修改[\s、，,和及/／]*可删除/u,
  },
  {
    label: "系统会提出一个重点",
    pattern: /系统会提出一个重点/u,
  },
];

async function collectProductionPages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const pages = [];

  for (const entry of entries) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) {
      pages.push(...(await collectProductionPages(entryUrl)));
      continue;
    }

    const extension = extname(entry.name);
    if (/^page\.(?:[cm]?[jt]sx?)$/u.test(entry.name) && extension) {
      pages.push(fileURLToPath(entryUrl));
    }
  }

  return pages.sort();
}

test("生产 app 页面不向客户暴露内部评审文案", async () => {
  const pageFiles = await collectProductionPages(new URL("../app/", import.meta.url));
  assert.ok(pageFiles.length > 0, "未找到可扫描的生产 app 页面");

  const violations = [];
  for (const pageFile of pageFiles) {
    const source = await readFile(pageFile, "utf8");
    const lines = source.split(/\r?\n/u);

    lines.forEach((line, index) => {
      for (const blocked of blockedClientCopy) {
        if (blocked.pattern.test(line)) {
          violations.push(
            `${relative(appDirectory, pageFile)}:${index + 1} [${blocked.label}] ${line.trim()}`,
          );
        }
      }
    });
  }

  // 隐私、本地保存与浏览器存储说明是客户需要的产品文案，不在禁用范围。
  assert.deepEqual(
    violations,
    [],
    `发现内部 PRD/评审文案泄漏：\n${violations.join("\n")}`,
  );
});
