#!/usr/bin/env node
/** legal:gen - canonical Markdown → committed generated TS (web) + Kotlin (mobile). */
import { writeFileSync, existsSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { buildDocuments, emitTs, emitKotlin, TS_PATH, KT_PATH, buildConsent, emitConsentTs, emitConsentKotlin, CONSENT_TS_PATH, CONSENT_KT_PATH } from "./build.mjs"

const built = buildDocuments()
for (const p of [TS_PATH, KT_PATH]) {
  if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true })
}
writeFileSync(TS_PATH, emitTs(built))
writeFileSync(KT_PATH, emitKotlin(built))
const consent = buildConsent()
writeFileSync(CONSENT_TS_PATH, emitConsentTs(consent))
writeFileSync(CONSENT_KT_PATH, emitConsentKotlin(consent))
console.log(`legal:gen - emitted ${built.length} documents and the marketing consent wording (TS + Kotlin).`)
