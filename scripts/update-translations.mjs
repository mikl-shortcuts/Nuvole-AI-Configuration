import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import fetch from 'node-fetch';

const DICTIONARIES_DIR = path.resolve('dictionaries');
const EN_FILE = path.join(DICTIONARIES_DIR, 'en.json');
const API_URL = 'https://nuvole-systems.vercel.app/api/translator';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

const API_KEY = process.env.TRANSLATION_API_KEY;
if (!API_KEY) {
  log('error', 'TRANSLATION_API_KEY is not set');
  throw new Error('Missing TRANSLATION_API_KEY');
}

function log(level, message) {
  const timestamp = new Date().toISOString();
  const prefix = { info: '[INFO]', warn: '[WARN]', error: '[ERROR]' }[level] || '[LOG]';
  console.log(`${timestamp} ${prefix} ${message}`);
}

function getPreviousEnJson() {
  try {
    const relPath = path.relative(process.cwd(), EN_FILE).replace(/\\/g, '/');
    const content = execSync(`git show HEAD~1:${relPath}`, { encoding: 'utf8' });
    return JSON.parse(content);
  } catch (err) {
    log('warn', 'Failed to get previous en.json from git. Using empty object.');
    return {};
  }
}

function getCurrentEnJson() {
  try {
    const content = fs.readFileSync(EN_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    log('error', `Failed to read current en.json: ${err.message}`);
    throw err;
  }
}

function getLanguageFiles() {
  const files = fs.readdirSync(DICTIONARIES_DIR);
  return files
    .filter(file => file.endsWith('.json') && file !== 'en.json')
    .map(file => path.join(DICTIONARIES_DIR, file));
}

async function translateWithRetry(payload, lang, retries = MAX_RETRIES) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '<unreadable>');
      log('error', `API error ${response.status}: ${errorText}`);
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (retries > 0 && (err.name === 'AbortError' || err.message.includes('HTTP'))) {
      log('warn', `Translation failed for ${lang}, retrying... (${MAX_RETRIES - retries + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return translateWithRetry(payload, lang, retries - 1);
    }
    throw err;
  }
}

function writeJsonOrdered(filePath, orderedEntries) {
  const obj = Object.fromEntries(orderedEntries);
  const jsonStr = JSON.stringify(obj, null, 2) + '\n';
  fs.writeFileSync(filePath, jsonStr, 'utf8');
}

async function updateLanguageFile(langPath, currentEn, prevEn) {
  const langCode = path.basename(langPath, '.json');
  log('info', `Processing language: ${langCode}`);

  let langData = {};
  try {
    const content = fs.readFileSync(langPath, 'utf8');
    langData = JSON.parse(content);
  } catch (err) {
    log('warn', `No existing translation file for ${langCode}, starting fresh.`);
  }

  const currentEnKeys = new Set(Object.keys(currentEn));
  const prevEnKeys = new Set(Object.keys(prevEn));

  const changedKeys = {};
  for (const key of currentEnKeys) {
    const enValue = currentEn[key]?.value;
    const prevEnValue = prevEn[key]?.value;
    if (enValue === undefined) continue;
    if (!prevEnKeys.has(key) || prevEnValue !== enValue) {
      changedKeys[key] = enValue;
    }
  }

  const newLangData = {};
  for (const key of currentEnKeys) {
    if (langData[key]) {
      newLangData[key] = langData[key];
    }
  }

  if (Object.keys(changedKeys).length > 0) {
    log('info', `Translating ${Object.keys(changedKeys).length} new/changed keys for ${langCode}`);
    try {
      const payload = { json: changedKeys, to: langCode, from: 'en' };
      const apiResponse = await translateWithRetry(payload, langCode);
      const translations = apiResponse || {};

      for (const [key, enValue] of Object.entries(changedKeys)) {
        const translatedValue = translations[key];
        if (translatedValue !== undefined) {
          newLangData[key] = {
            value: translatedValue,
            original: { value: enValue },
            translatedBy: 'ai',
            isTranslated: true
          };
        } else {
          log('warn', `No translation received for key "${key}" in ${langCode}, falling back to English`);
          newLangData[key] = {
            value: enValue,
            original: { value: enValue },
            translatedBy: 'none',
            isTranslated: false
          };
        }
      }
    } catch (err) {
      log('error', `Failed to translate for ${langCode} after retries: ${err.message}`);
      for (const [key, enValue] of Object.entries(changedKeys)) {
        newLangData[key] = {
          value: enValue,
          original: { value: enValue },
          translatedBy: 'none',
          isTranslated: false
        };
      }
    }
  }

  const changedKeySet = new Set(Object.keys(changedKeys));
  const orderedEntries = [];

  for (const key of Object.keys(newLangData)) {
    if (changedKeySet.has(key)) {
      orderedEntries.unshift([key, newLangData[key]]);
    } else {
      orderedEntries.push([key, newLangData[key]]);
    }
  }

  writeJsonOrdered(langPath, orderedEntries);
  log('info', `Updated ${langPath}`);
}

async function main() {
  log('info', 'Starting translation update...');
  const prevEn = getPreviousEnJson();
  const currentEn = getCurrentEnJson();
  const langFiles = getLanguageFiles();

  if (langFiles.length === 0) {
    log('warn', 'No language files found to update.');
    return;
  }

  for (const langFile of langFiles) {
    await updateLanguageFile(langFile, currentEn, prevEn);
  }

  log('info', 'Translation update completed.');
}

main().catch(err => {
  log('error', `Script failed: ${err.message}`);
  process.exitCode = 1;
});