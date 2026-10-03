// 보내온 판 기록을 받아 온다 — 공개판이 Cloudflare KV(bolzena-records)에 쌓은 것을 records/ 로(저장소에는 안 넣는다).
// wrangler 에 로그인한 사람만 읽을 수 있다(읽는 주소는 열어 두지 않았다 — functions/api/record.js).
//
//   npm run records:pull     받아 오고 곧장 모아 본다(tools/records.js records)
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const NS = "c4ddda9070294a9784c366daa02300b7";   // wrangler.toml 의 RECORDS
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "records");
const wr = (...a) => execFileSync("npx", ["wrangler", "kv", ...a, "--namespace-id", NS, "--remote"], { encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "ignore"] });

fs.mkdirSync(OUT, { recursive: true });
const keys = JSON.parse(wr("key", "list", "--prefix", "rec/")).map((k) => k.name);
let got = 0;
for (const k of keys) {
  const file = path.join(OUT, "볼제나-기록-" + k.slice(4).replace(/\//g, "-") + ".json");
  if (fs.existsSync(file)) continue;
  fs.writeFileSync(file, wr("key", "get", JSON.stringify(k)));
  got++;
}
console.log(`기록 ${keys.length}개 중 새로 ${got}개를 받았습니다 → ${OUT}\n`);
execFileSync(process.execPath, [path.join(ROOT, "tools", "records.js"), OUT], { stdio: "inherit" });
