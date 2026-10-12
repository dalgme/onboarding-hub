// 스위트 실행기 — qa/suites/*.mjs 를 이름순으로 돌리고 합계를 낸다. 실패가 있으면 종료 코드 1.
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { createReporter, qa, APP, MOCK } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const suitesDir = join(here, "..", "suites");
const wanted = process.argv.slice(2);
const files = readdirSync(suitesDir)
  .filter((file) => file.endsWith(".mjs"))
  .sort()
  .filter((file) => wanted.length === 0 || wanted.some((name) => file.includes(name)));

if (files.length === 0) {
  console.error(`스위트가 없습니다: ${wanted.join(", ")}`);
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const summaries = [];
console.log(`[qa] app ${APP} · mock ${MOCK} · 스위트 ${files.length}개\n`);
for (const file of files) {
  const name = file.replace(/\.mjs$/, "");
  console.log(`━━━ ${name}`);
  const t = createReporter(name);
  await qa.reset({ auth: true });
  try {
    const mod = await import(join(suitesDir, file));
    await mod.default({ browser, t });
  } catch (cause) {
    t.ok(`${name}: 스위트 자체가 중단됨`, false, cause instanceof Error ? (cause.stack ?? cause.message) : cause);
  }
  summaries.push(t.summary());
  console.log("");
}
await browser.close();

let failed = 0;
console.log("━━━ 합계");
for (const summary of summaries) {
  failed += summary.failed;
  console.log(`${summary.failed === 0 ? "✅" : "❌"} ${summary.suite}: ${summary.passed}/${summary.total} 통과`);
}
console.log(failed === 0 ? "\n전부 통과" : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
