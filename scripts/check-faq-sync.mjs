import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const FAQ_PATH = path.join(WEB_DIR, 'faq.html');

const USER_FACING_PATTERNS = {
  web: /^((index|learn-more|mobile-preview)\.html|js\/.*\.js|css\/.*\.css)$/,
  backend: /^src\/(routes|types|entitlements|tags|auth)\.ts$/,
  android: /^app\/src\/main\/java\/.*\/(ui\/screens|ui\/navigation|data\/model|data\/local)\/.*\.kt$/
};

function validateFaqHtml() {
  if (!fs.existsSync(FAQ_PATH)) {
    throw new Error(`Missing FAQ page at ${FAQ_PATH}`);
  }

  const html = fs.readFileSync(FAQ_PATH, 'utf8');

  const faqItems = html.match(/<details\s+class="faq-item"/g) || [];
  if (faqItems.length < 10) {
    throw new Error(`Expected at least 10 .faq-item entries in faq.html, found ${faqItems.length}`);
  }

  const keySet = new Set();
  for (const m of html.matchAll(/\bdata-i18n="([^"]+)"/g)) {
    keySet.add(m[1]);
  }
  for (const m of html.matchAll(/\bdata-i18n-placeholder="([^"]+)"/g)) {
    keySet.add(m[1]);
  }

  const i18nMatch = html.match(/const\s+I18N\s*=\s*(\{[\s\S]*?\n\s*\});/);
  if (!i18nMatch) {
    throw new Error('Could not locate const I18N = { ... }; dictionary in faq.html');
  }

  const i18nObj = vm.runInNewContext(`(${i18nMatch[1]})`);
  if (!i18nObj?.en || !i18nObj?.id) {
    throw new Error('I18N dictionary in faq.html must define both "en" and "id" objects');
  }

  const missingEn = [];
  const missingId = [];
  for (const key of keySet) {
    if (typeof i18nObj.en[key] !== 'string' || !i18nObj.en[key].trim()) {
      missingEn.push(key);
    }
    if (typeof i18nObj.id[key] !== 'string' || !i18nObj.id[key].trim()) {
      missingId.push(key);
    }
  }

  if (missingEn.length || missingId.length) {
    const parts = [];
    if (missingEn.length) parts.push(`missing EN keys: ${missingEn.join(', ')}`);
    if (missingId.length) parts.push(`missing ID keys: ${missingId.join(', ')}`);
    throw new Error(`faq.html i18n coverage incomplete (${parts.join('; ')})`);
  }

  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"\s+id="faqJsonLd">([\s\S]*?)<\/script>/);
  if (!jsonLdMatch) {
    throw new Error('Missing <script type="application/ld+json" id="faqJsonLd"> in faq.html');
  }

  let jsonLd;
  try {
    jsonLd = JSON.parse(jsonLdMatch[1]);
  } catch (err) {
    throw new Error(`Invalid JSON in #faqJsonLd: ${err.message}`);
  }

  if (jsonLd['@type'] !== 'FAQPage' || !Array.isArray(jsonLd.mainEntity)) {
    throw new Error('#faqJsonLd must have @type "FAQPage" and a mainEntity array');
  }

  if (jsonLd.mainEntity.length !== faqItems.length) {
    throw new Error(
      `#faqJsonLd mainEntity count (${jsonLd.mainEntity.length}) does not match .faq-item count (${faqItems.length})`
    );
  }

  for (let i = 0; i < jsonLd.mainEntity.length; i++) {
    const entry = jsonLd.mainEntity[i];
    if (
      entry?.['@type'] !== 'Question' ||
      typeof entry?.name !== 'string' ||
      !entry.name.trim() ||
      typeof entry?.acceptedAnswer?.text !== 'string' ||
      !entry.acceptedAnswer.text.trim()
    ) {
      throw new Error(`Invalid Question entry at #faqJsonLd.mainEntity[${i}]`);
    }
  }

  return { itemCount: faqItems.length, i18nKeys: keySet.size };
}

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function getRepoName(cwd) {
  try {
    const topLevel = runGit(cwd, ['rev-parse', '--show-toplevel']);
    return path.basename(topLevel).toLowerCase();
  } catch {
    return path.basename(cwd).toLowerCase();
  }
}

function getStagedFiles(stagedArg, cwd) {
  if (stagedArg !== null) {
    return stagedArg
      .split(',')
      .map((s) => s.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  }
  const out = runGit(cwd, ['diff', '--cached', '--name-only', '--diff-filter=ACMRD']);
  return out
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

function hasRecentWebFaqUpdate() {
  try {
    const dirty = runGit(WEB_DIR, ['status', '--porcelain', 'faq.html']);
    if (dirty.length > 0) return true;
  } catch {
    // ignore
  }
  try {
    const tsRaw = runGit(WEB_DIR, ['log', '-1', '--format=%ct', '--', 'faq.html']);
    if (tsRaw) {
      const ageSeconds = Math.floor(Date.now() / 1000) - Number(tsRaw);
      if (Number.isFinite(ageSeconds) && ageSeconds >= 0 && ageSeconds <= 1800) {
        return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

function parseCliArgs(argv) {
  const opts = {
    validate: false,
    hook: null,
    msgFile: null,
    stagedFiles: null
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--validate') {
      opts.validate = true;
    } else if (arg === '--hook') {
      opts.hook = argv[++i] || null;
    } else if (arg === '--staged-files') {
      opts.stagedFiles = argv[++i] ?? '';
    } else if (!arg.startsWith('-') && !opts.msgFile) {
      opts.msgFile = arg;
    }
  }
  return opts;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));

  try {
    const summary = validateFaqHtml();
    if (opts.validate && !opts.hook) {
      console.log(
        `[faq-check] OK: ${summary.itemCount} FAQ items, ${summary.i18nKeys} EN/ID i18n keys, and FAQPage JSON-LD verified.`
      );
      return;
    }
  } catch (err) {
    console.error(`[faq-check] ERROR: ${err.message}`);
    process.exit(1);
  }

  if (!opts.hook) {
    return;
  }

  if (process.env.SKIP_FAQ_CHECK === '1') {
    return;
  }

  const cwd = process.cwd();
  const repoName = getRepoName(cwd);
  const pattern = USER_FACING_PATTERNS[repoName];
  if (!pattern) {
    return;
  }

  const staged = getStagedFiles(opts.stagedFiles, cwd);
  const touchedUserFacing = staged.filter((file) => pattern.test(file));
  if (touchedUserFacing.length === 0) {
    return;
  }

  const faqUpdated =
    repoName === 'web'
      ? staged.includes('faq.html')
      : hasRecentWebFaqUpdate();

  if (faqUpdated) {
    return;
  }

  if (opts.hook === 'pre-commit') {
    console.log(
      `[faq-sync] Reminder: user-facing files staged (${touchedUserFacing.join(', ')}), but web/faq.html is not updated.`
    );
    console.log(
      '[faq-sync] Update web/faq.html if needed, or include [faq-ok] in your commit message if no FAQ change is necessary.'
    );
    return;
  }

  if (opts.hook === 'commit-msg') {
    let commitMsg = '';
    if (opts.msgFile && fs.existsSync(opts.msgFile)) {
      commitMsg = fs.readFileSync(opts.msgFile, 'utf8');
    }
    if (/\[(faq-ok|no-faq)\]/i.test(commitMsg)) {
      return;
    }

    console.error('');
    console.error('[faq-sync] Commit blocked: user-facing files changed without an FAQ update:');
    for (const f of touchedUserFacing) {
      console.error(`  - ${f}`);
    }
    console.error('');
    console.error('To proceed, do one of the following:');
    console.error('  1. Update web/faq.html (EN + ID + #faqJsonLd) and stage it in this commit (or commit it in web/).');
    console.error('  2. If no FAQ update is necessary, include [faq-ok] in your commit message (or run with SKIP_FAQ_CHECK=1).');
    console.error('');
    process.exit(1);
  }
}

main();
