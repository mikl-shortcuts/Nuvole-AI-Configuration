import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import fetch from 'node-fetch';

const DICTIONARIES_DIR = path.resolve('dictionaries');
const EN_FILE = path.join(DICTIONARIES_DIR, 'en.json');
const API_URL = 'https://translateapi-six.vercel.app/api/translate';

function getPreviousEnJson() {
  try {
    const relPath = path.relative(process.cwd(), EN_FILE).replace(/\\/g, '/');
    const content = execSync(`git show HEAD~1:${relPath}`, { encoding: 'utf8' });
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function getCurrentEnJson() {
  const content = fs.readFileSync(EN_FILE, 'utf8');
  return JSON.parse(content);
}

function getLanguageFiles() {
  const files = fs.readdirSync(DICTIONARIES_DIR);
  return files
    .filter(file => file.endsWith('.json') && file !== 'en.json')
    .map(file => path.join(DICTIONARIES_DIR, file));
}

async function translateText(textObj, lang) {
  const payload = {
    json: JSON.stringify(textObj),
    language: lang
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error Response:', errorText);
    throw new Error(`Translation API error: ${response.status}`);
  }

  return response.json();
}

function writeJsonOrdered(filePath, orderedEntries) {
  const obj = Object.fromEntries(orderedEntries);
  const jsonStr = JSON.stringify(obj, null, 2) + '\n';
  fs.writeFileSync(filePath, jsonStr, 'utf8');
}

async function updateLanguageFile(langPath, currentEn, prevEn) {
  const langCode = path.basename(langPath, '.json');
  let langData = {};
  try {
    const content = fs.readFileSync(langPath, 'utf8');
    langData = JSON.parse(content);
  } catch {}

  const currentEnKeys = new Set(Object.keys(currentEn));
  const prevEnKeys = new Set(Object.keys(prevEn));

  const changedKeys = {};
  for (const key of currentEnKeys) {
    const enValue = currentEn[key].value;
    const prevEnValue = prevEn[key]?.value;
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
    const translations = await translateText(changedKeys, langCode);
    for (const [key, enValue] of Object.entries(changedKeys)) {
      const translatedValue = translations[key] ?? enValue;
      newLangData[key] = {
        value: translatedValue,
        original: { value: enValue },
        translatedBy: 'ai',
        isTranslated: true
      };
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
}

async function main() {
  const prevEn = getPreviousEnJson();
  const currentEn = getCurrentEnJson();
  const langFiles = getLanguageFiles();

  for (const langFile of langFiles) {
    await updateLanguageFile(langFile, currentEn, prevEn);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});