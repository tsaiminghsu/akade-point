/**
 * Deep-merges a JSON file of { "zh-TW": {...}, "en-US": {...}, "ja-JP": {...} }
 * into messages/control-center/*.json, then checks all three locales have the
 * same keys.
 *
 *   node scripts/i18n/merge.mjs scripts/i18n/gcs-adsb.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["zh-TW", "en-US", "ja-JP"];
const src = JSON.parse(readFileSync(process.argv[2], "utf8"));

const merge = (into, add) => {
  for (const [k, v] of Object.entries(add)) {
    if (v && typeof v === "object" && !Array.isArray(v)) merge((into[k] ??= {}), v);
    else into[k] = v;
  }
};

const file = (l) => new URL(`../../messages/control-center/${l}.json`, import.meta.url);
for (const l of LOCALES) {
  if (!src[l]) throw new Error(`missing ${l}`);
  const m = JSON.parse(readFileSync(file(l), "utf8"));
  merge(m, src[l]);
  writeFileSync(file(l), `${JSON.stringify(m, null, 2)}\n`);
}

const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const sets = LOCALES.map((l) => new Set(flat(JSON.parse(readFileSync(file(l), "utf8")))));
const diff = [...sets[0]].filter((k) => !sets[1].has(k) || !sets[2].has(k));
if (diff.length || sets[1].size !== sets[0].size || sets[2].size !== sets[0].size) {
  console.error("locale key mismatch", diff.slice(0, 10), sets.map((s) => s.size));
  process.exit(1);
}
console.log("ok", sets[0].size, "keys per locale");
