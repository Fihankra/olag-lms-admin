#!/usr/bin/env node
/**
 * Transforms question JSON files:
 * 1. MCQ: answer string → answer array (e.g. "6" → ["6"])
 * 2. short_answer: expands keywords with text-friendly alternatives
 *    (removes/replaces math symbols, adds synonyms, lowercase variants)
 */
const fs = require('fs');
const path = require('path');

// Maps special characters/symbols to text equivalents students can type
function textFriendly(str) {
  return str
    .replace(/[²³⁴⁵⁶⁷⁸⁹⁰¹]/g, s => ({'²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁰':'0','¹':'1'}[s]||s))
    .replace(/[α-ωΑ-Ω]/g, '')  // remove Greek letters (handled by word keywords)
    .replace(/[×÷≤≥≠≈∞∑∫√π]/g, ' ')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, s => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(s)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Generate extra keyword variants from the existing keywords array
function expandKeywords(keywords) {
  const extras = new Set();

  keywords.forEach(kw => {
    const plain = textFriendly(kw);
    if (plain && plain !== kw.toLowerCase()) extras.add(plain);

    // Strip punctuation variant
    const noPunct = kw.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (noPunct) extras.add(noPunct);

    // Common abbreviation expansions
    const abbrevMap = {
      'dna': 'deoxyribonucleic acid',
      'rna': 'ribonucleic acid',
      'atp': 'adenosine triphosphate',
      'co2': 'carbon dioxide',
      'o2': 'oxygen',
      'h2o': 'water',
      'gdp': 'gross domestic product',
      'gnp': 'gross national product',
      'imf': 'international monetary fund',
      'un': 'united nations',
      'ecowas': 'economic community of west african states',
      'hiv': 'human immunodeficiency virus',
      'aids': 'acquired immune deficiency syndrome',
      'ict': 'information and communications technology',
      'cpu': 'central processing unit',
      'ram': 'random access memory',
      'rom': 'read only memory',
      'lan': 'local area network',
      'wan': 'wide area network',
      'http': 'hypertext transfer protocol',
      'html': 'hypertext markup language',
      'css': 'cascading style sheets',
      'www': 'world wide web',
      'url': 'uniform resource locator',
      'ip': 'internet protocol',
      'os': 'operating system',
      'gui': 'graphical user interface',
    };

    const lower = kw.toLowerCase().trim();
    if (abbrevMap[lower]) extras.add(abbrevMap[lower]);
    // reverse: if keyword is full form, add abbreviation
    Object.entries(abbrevMap).forEach(([abbr, full]) => {
      if (lower === full) extras.add(abbr);
    });
  });

  // Return merged unique list, putting original keywords first
  const merged = [...keywords];
  extras.forEach(e => {
    if (!merged.map(k => k.toLowerCase()).includes(e.toLowerCase())) {
      merged.push(e);
    }
  });
  return merged;
}

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'transform.js');

let totalMcqFixed = 0;
let totalShortFixed = 0;

files.forEach(file => {
  const filePath = path.join(dir, file);
  let questions;
  try {
    questions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Skipping ${file}: ${e.message}`);
    return;
  }

  let mcqFixed = 0;
  let shortFixed = 0;

  const transformed = questions.map(q => {
    if (q.type === 'mcq') {
      if (typeof q.answer === 'string') {
        q.answer = [q.answer];
        mcqFixed++;
      }
    } else if (q.type === 'short_answer') {
      if (Array.isArray(q.keywords)) {
        const expanded = expandKeywords(q.keywords);
        if (expanded.length > q.keywords.length) shortFixed++;
        q.keywords = expanded;
      }
    }
    return q;
  });

  fs.writeFileSync(filePath, JSON.stringify(transformed, null, 2));
  console.log(`${file}: ${mcqFixed} MCQ answers wrapped, ${shortFixed} short_answer keyword sets expanded`);
  totalMcqFixed += mcqFixed;
  totalShortFixed += shortFixed;
});

console.log(`\nDone. Total: ${totalMcqFixed} MCQ answers → arrays, ${totalShortFixed} short_answer keyword sets expanded.`);
