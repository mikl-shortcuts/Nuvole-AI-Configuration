import fs from 'fs';
import path from 'path';
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

function writeJsonOrdered(filePath, data) {
  const jsonStr = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(filePath, jsonStr, 'utf8');
}

async function processLanguageFile(langPath, enData) {
  const langCode = path.basename(langPath, '.json');
  log('info', `Checking language: ${langCode}`);

  let langData = {};
  try {
    const content = fs.readFileSync(langPath, 'utf8');
    langData = JSON.parse(content);
  } catch (err) {
    log('error', `Failed to read ${langCode}: ${err.message}`);
    return;
  }

  const keysToTranslate = {};
  
  for (const key of Object.keys(langData)) {
    const entry = langData[key];
    const enEntry = enData[key];

    if (entry && entry.translatedBy === 'none' && enEntry) {
      keysToTranslate[key] = enEntry.value;
    }
  }

  if (Object.keys(keysToTranslate).length === 0) {
    log('info', `No pending translations (none) found for ${langCode}`);
    return;
  }

  log('info', `Found ${Object.keys(keysToTranslate).length} keys with 'none' status in ${langCode}. Retrying translation...`);

  try {
    const payload = { json: keysToTranslate, to: langCode, from: 'en' };
    const apiResponse = await translateWithRetry(payload, langCode);
    const translations = apiResponse || {};

    let updatedCount = 0;

    for (const [key, enValue] of Object.entries(keysToTranslate)) {
      const translatedValue = translations[key];
      
      if (translatedValue !== undefined) {
        langData[key] = {
          value: translatedValue,
          original: { value: enValue },
          translatedBy: 'ai',
          isTranslated: true
        };
        updatedCount++;
      } else {
        log('warn', `Translation still failed for "${key}" in ${langCode}`);
        langData[key] = {
          value: enValue,
          original: { value: enValue },
          translatedBy: 'none',
          isTranslated: false
        };
      }
    }

    writeJsonOrdered(langPath, langData);
    log('info', `Updated ${updatedCount} keys for ${langCode}`);

  } catch (err) {
    log('error', `Batch translation failed for ${langCode}: ${err.message}`);
    
    for (const key of Object.keys(keysToTranslate)) {
      const cleanValue = enData[key]?.value;
      if (cleanValue) {
        langData[key] = {
          value: cleanValue,
          original: { value: cleanValue },
          translatedBy: 'none',
          isTranslated: false
        };
      }
    }
    writeJsonOrdered(langPath, langData);
  }
}

async function main() {
  log('info', 'Starting manual re-translation workflow...');
  
  let currentEn;
  try {
    currentEn = getCurrentEnJson();
  } catch (e) {
    return;
  }

  const langFiles = getLanguageFiles();

  if (langFiles.length === 0) {
    log('warn', 'No language files found.');
    return;
  }

  for (const langFile of langFiles) {
    await processLanguageFile(langFile, currentEn);
  }

  log('info', 'Re-translation workflow completed.');
}

main().catch(err => {
  log('error', `Script failed: ${err.message}`);
  process.exitCode = 1;
});