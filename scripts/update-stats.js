import fs from 'fs';
import path from 'path';

const DICT_DIR = path.resolve('dictionaries');
const README_FILE = path.resolve('README.md');
const START_MARKER = '<!-- TRANSLATION_STATS_START -->';
const END_MARKER = '<!-- TRANSLATION_STATS_END -->';

const LANG_MAP = {
  ar: "🇸🇦 Arabic", bg: "🇧🇬 Bulgarian", zh: "🇨🇳 Chinese", hr: "🇭🇷 Croatian",
  cs: "🇨🇿 Czech", da: "🇩🇰 Danish", nl: "🇳🇱 Dutch", en: "🇬🇧 English",
  et: "🇪🇹 Estonian", fi: "🇫🇮 Finnish", fr: "🇫🇷 French", de: "🇩🇪 German",
  el: "🇬🇷 Greek", gu: "🇬🇺 Gujarati", he: "🇮🇱 Hebrew", hi: "🇮🇳 Hindi",
  hu: "🇭🇺 Hungarian", id: "🇮🇩 Indonesian", it: "🇮🇹 Italian", ja: "🇯🇵 Japanese",
  kn: "🇰🇳 Kannada", ko: "🇰🇷 Korean", lv: "🇱🇻 Latvian", lt: "🇱🇹 Lithuanian",
  ml: "🇲🇱 Malayalam", mr: "🇲🇷 Marathi", no: "🇳🇴 Norwegian", fa: "🇮🇷 Persian",
  pl: "🇵🇱 Polish", pt: "🇵🇹 Portuguese", ro: "🇷🇴 Romanian", ru: "🇷🇺 Russian",
  sr: "🇷🇸 Serbian", sk: "🇸🇰 Slovak", sl: "🇸🇮 Slovenian", es: "🇪🇸 Spanish",
  sw: "🇰🇪 Swahili", sv: "🇸🇪 Swedish", ta: "🇹🇦 Tamil", te: "🇮🇳 Telugu",
  th: "🇹🇭 Thai", tr: "🇹🇷 Turkish", ur: "🇵🇰 Urdu", vi: "🇻🇳 Vietnamese"
};

function getLangDisplay(code) {
  return LANG_MAP[code] || `🏳️ ${code.toUpperCase()}`;
}

function generateStats() {
  const files = fs.readdirSync(DICT_DIR).filter(f => f.endsWith('.json'));
  const stats = [];

  for (const file of files) {
    const code = path.basename(file, '.json');
    let content;
    try {
      content = JSON.parse(fs.readFileSync(path.join(DICT_DIR, file), 'utf8'));
    } catch (e) {
      continue;
    }

    const total = Object.keys(content).length;
    let aiCount = 0;
    let humanCount = 0;
    const contributors = {};

    if (code === 'en') {
      humanCount = total;
      contributors['mikl-shortcuts'] = total;
    } else {
      for (const key in content) {
        const entry = content[key];
        const by = entry.translatedBy;

        if (by === 'ai') {
          aiCount++;
        } else if (by && by !== 'none') {
          humanCount++;
          contributors[by] = (contributors[by] || 0) + 1;
        }
      }
    }

    const percent = total > 0 ? Math.round((humanCount / total) * 100) : 0;
    
    stats.push({
      code,
      total,
      aiCount,
      humanCount,
      percent,
      contributors
    });
  }

  stats.sort((a, b) => {
    if (a.code === 'en') return -1;
    if (b.code === 'en') return 1;
    return b.percent - a.percent;
  });

  return stats;
}

function formatContributors(contributors) {
  const entries = Object.entries(contributors);
  if (entries.length === 0) return '-';
  
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `[@${name}](https://github.com/${name}) (${count})`)
    .join(', ');
}

function updateReadme() {
  const stats = generateStats();
  
  let table = '| Language | Human Progress | AI Translated | Human Translated | Top Contributors |\n';
  table += '| :--- | :--- | :---: | :---: | :--- |\n';

  for (const stat of stats) {
    const langDisplay = getLangDisplay(stat.code);
    const progressBar = `![${stat.percent}%](https://progress-bar.dev/${stat.percent}?width=200)`;
    const contribs = formatContributors(stat.contributors);
    
    table += `| ${langDisplay} | ${progressBar} | ${stat.aiCount} | ${stat.humanCount} | ${contribs} |\n`;
  }

  let readme = fs.readFileSync(README_FILE, 'utf8');
  
  const regex = new RegExp(`${START_MARKER}[\\s\\S]*?${END_MARKER}`);
  
  if (!regex.test(readme)) {
    console.error('Markers not found in README.md');
    process.exit(1);
  }

  const newContent = `${START_MARKER}\n\n${table}\n${END_MARKER}`;
  readme = readme.replace(regex, newContent);

  fs.writeFileSync(README_FILE, readme, 'utf8');
  console.log('README.md updated successfully.');
}

updateReadme();