#!/usr/bin/env node
// agent-health.mjs — Audit de santé quotidien du roster d'agents (agency-agents).
// Zéro dépendance externe (Node >= 18).
//
// Usage :
//   node scripts/agent-health.mjs [--fix] [--report] [--ci]
//
//   --fix     applique les correctifs sûrs : BOM, CRLF -> LF, espaces de fin
//             de ligne, newline final manquant.
//   --report  écrit docs/reports/maintenance/<date>.md et LATEST.md.
//   --ci      émet des annotations GitHub ::error / ::warning.
//
// Codes de sortie : 0 = aucune erreur (warnings possibles), 1 = au moins une
// erreur, 2 = problème d'environnement.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIVISIONS_FILE = join(ROOT, 'divisions.json');
const REPORT_DIR = join(ROOT, 'docs', 'reports', 'maintenance');

const args = new Set(process.argv.slice(2));
const FIX = args.has('--fix');
const REPORT = args.has('--report');
const CI = args.has('--ci');

const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.isFile() && e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

function unquote(v) {
  const t = v.trim();
  if (
    t.length >= 2 &&
    ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseFrontmatter(text) {
  // Retourne { fm, body, error, badLines } — error est un code si le
  // frontmatter est absent ou non fermé.
  if (!text.startsWith('---\n')) {
    return { fm: null, body: text, error: 'fm-missing', badLines: [] };
  }
  const lines = text.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { fm: null, body: text, error: 'fm-unclosed', badLines: [] };
  const fm = {};
  const badLines = [];
  for (const l of lines.slice(1, end)) {
    if (!l.trim()) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(l);
    if (!m) {
      badLines.push(l.trim());
      continue;
    }
    fm[m[1]] = unquote(m[2]);
  }
  return { fm, body: lines.slice(end + 1).join('\n'), error: null, badLines };
}

// Contenu du corps HORS des blocs de code fences + détection de fence non fermé.
function outsideFences(body) {
  const out = [];
  let inFence = false;
  for (const l of body.split('\n')) {
    if (l.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(l);
  }
  return { text: out.join('\n'), unbalanced: inFence };
}

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{20,}/, 'clé de type OpenAI (sk-…) exposée'],
  [/AKIA[0-9A-Z]{16}/, "clé d'accès AWS (AKIA…) exposée"],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'token GitHub exposé'],
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'clé privée exposée'],
];

function auditAgent(rel, text, division, existCheck) {
  const issues = [];
  const add = (severity, code, msg) => issues.push({ severity, code, msg, file: rel });

  const { fm, body, error, badLines } = parseFrontmatter(text);
  if (error) {
    add(
      'ERROR',
      error,
      error === 'fm-missing'
        ? 'frontmatter YAML manquant (le fichier doit commencer par ---)'
        : 'frontmatter non fermé (--- de fermeture absent)'
    );
    return { issues, name: null, stem: null };
  }
  for (const b of badLines) add('WARN', 'fm-line', 'ligne frontmatter non parsée : ' + b);

  if (!fm.name || !fm.name.trim()) add('ERROR', 'fm-name', 'champ "name" manquant ou vide');
  else if (fm.name.trim().length > 60) add('WARN', 'fm-name-long', 'champ "name" très long (> 60 caractères)');

  if (!fm.description || !fm.description.trim()) add('ERROR', 'fm-description', 'champ "description" manquant ou vide');
  else if (fm.description.trim().length < 40) add('WARN', 'fm-description-short', 'description trop courte (< 40 caractères)');

  if (fm.color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(fm.color)) {
    add('ERROR', 'fm-color', 'couleur invalide : ' + JSON.stringify(fm.color) + ' (attendu #RRGGBB)');
  }
  if (!fm.emoji) add('WARN', 'fm-emoji', 'champ "emoji" absent (recommandé)');
  if (!fm.vibe) add('WARN', 'fm-vibe', 'champ "vibe" absent (recommandé)');

  const stem = rel.split('/').pop().replace(/\.md$/, '');
  if (!stem.startsWith(division + '-')) {
    add('WARN', 'naming', 'nom de fichier non conventionnel : attendu « ' + division + '-<nom>.md »');
  }

  const bodyTrim = body.trim();
  if (bodyTrim.length === 0) add('ERROR', 'body-empty', 'corps du fichier vide');
  else if (bodyTrim.length < 300) add('WARN', 'body-short', 'corps très court (< 300 caractères)');

  const { text: outside, unbalanced } = outsideFences(body);
  if (unbalanced) add('ERROR', 'fences', 'bloc de code non fermé (``` orphelin)');
  if (/\b(TODO|FIXME|XXX|lorem ipsum)\b/i.test(outside)) {
    add('WARN', 'placeholder', 'texte placeholder détecté (TODO / FIXME / lorem ipsum…)');
  }

  for (const [re, msg] of SECRET_PATTERNS) {
    if (re.test(text)) add('ERROR', 'secret', msg);
  }
  const softSecret = /(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}["']/i;
  if (softSecret.test(outside)) add('WARN', 'secret-soft', 'valeur ressemblant à un secret en clair (à vérifier)');

  // Liens internes cassés (hors blocs de code)
  const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
  for (const m of outside.matchAll(linkRe)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    const clean = target.split('#')[0];
    if (!clean) continue;
    if (!existCheck(rel, clean)) add('ERROR', 'link', 'lien interne cassé : ' + target);
  }

  return { issues, name: fm.name || null, stem };
}

function fixText(text) {
  let t = text;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  t = t.replace(/\r\n/g, '\n');
  t = t.replace(/[ \t]+$/gm, '');
  if (t && !t.endsWith('\n')) t += '\n';
  return t;
}

// ---------------------------------------------------------------------------
// Audit global
// ---------------------------------------------------------------------------

function main() {
  if (!existsSync(DIVISIONS_FILE)) {
    console.error('ERREUR: divisions.json introuvable à la racine du dépôt.');
    process.exit(2);
  }
  let divisions;
  try {
    divisions = JSON.parse(readFileSync(DIVISIONS_FILE, 'utf8'));
  } catch (e) {
    console.error('ERREUR: divisions.json illisible : ' + e.message);
    process.exit(2);
  }
  const divisionDirs = Object.keys(divisions.divisions || {});

  const existCheck = (fromRel, target) => {
    const fromAbs = join(ROOT, fromRel);
    return existsSync(join(dirname(fromAbs), target)) || existsSync(join(ROOT, target));
  };

  const agents = [];
  const fixes = [];

  for (const d of divisionDirs) {
    const files = walk(join(ROOT, d));
    if (files.length === 0) {
      agents.push({
        rel: d + '/ (division vide)',
        division: d,
        issues: [{ severity: 'ERROR', code: 'empty-division', msg: 'division sans aucun agent .md', file: d + '/' }],
        name: null,
        stem: null,
      });
      continue;
    }
    for (const abs of files.sort()) {
      const rel = relative(ROOT, abs);
      const original = readFileSync(abs, 'utf8');
      let text = original;

      // Détection BOM / CRLF sur le contenu original, puis correctifs sûrs
      // AVANT l'audit (sinon un fichier CRLF serait vu comme sans frontmatter).
      const preIssues = [];
      if (original.charCodeAt(0) === 0xfeff) {
        preIssues.push({ severity: 'WARN', code: 'bom', msg: 'BOM UTF-8 détecté', file: rel });
      }
      if (original.includes('\r\n')) {
        preIssues.push({ severity: 'WARN', code: 'crlf', msg: 'fins de ligne CRLF détectées', file: rel });
      }
      if (FIX) {
        const fixed = fixText(original);
        if (fixed !== original) {
          writeFileSync(abs, fixed);
          fixes.push(rel);
          preIssues.push({
            severity: 'INFO',
            code: 'fixed',
            msg: 'correctif automatique appliqué (BOM / fins de ligne / espaces de fin / newline final)',
            file: rel,
          });
          text = fixed;
        }
      }

      const { issues, name, stem } = auditAgent(rel, text, d, existCheck);
      issues.unshift(...preIssues);
      agents.push({ rel, division: d, issues, name, stem });
    }
  }

  // Doublons de slugs et de noms d'agents
  const byStem = new Map();
  const byName = new Map();
  for (const a of agents) {
    if (!a.stem) continue;
    if (!byStem.has(a.stem)) byStem.set(a.stem, []);
    byStem.get(a.stem).push(a);
    const key = (a.name || '').trim().toLowerCase();
    if (key) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(a);
    }
  }
  const globalIssues = [];
  for (const [stem, list] of byStem) {
    if (list.length > 1) {
      globalIssues.push({
        severity: 'ERROR',
        code: 'dup-slug',
        msg: 'slug dupliqué (' + list.length + ' fichiers) : ' + list.map((x) => x.rel).join(', '),
        file: list[0].rel,
      });
    }
  }
  for (const [name, list] of byName) {
    if (list.length > 1) {
      globalIssues.push({
        severity: 'ERROR',
        code: 'dup-name',
        msg: "nom d'agent dupliqué « " + list[0].name + ' » : ' + list.map((x) => x.rel).join(', '),
        file: list[0].rel,
      });
    }
  }

  const allIssues = agents
    .flatMap((a) => a.issues.map((i) => ({ ...i, division: a.division })))
    .concat(globalIssues.map((i) => ({ ...i, division: '(global)' })));
  const errors = allIssues.filter((i) => i.severity === 'ERROR');
  const warns = allIssues.filter((i) => i.severity === 'WARN');

  // Scores par division et global
  const stats = [];
  let weightedSum = 0;
  let totalAgents = 0;
  for (const d of divisionDirs) {
    const count = agents.filter((a) => a.division === d && a.stem).length;
    const errs = errors.filter((i) => i.division === d).length;
    const wrns = warns.filter((i) => i.division === d).length;
    const score = Math.max(0, 100 - 5 * errs - 1 * wrns);
    stats.push({ division: d, agents: count, errors: errs, warns: wrns, score });
    weightedSum += score * count;
    totalAgents += count;
  }
  const globalScore = totalAgents > 0 ? Math.round(weightedSum / totalAgents) : 0;

  // Sortie console
  console.log('');
  console.log('🛡️  Audit de santé du roster — ' + today);
  console.log('     Agents analysés : ' + totalAgents + ' | Divisions : ' + divisionDirs.length);
  for (const s of stats) {
    const icon = s.errors > 0 ? '❌' : s.warns > 0 ? '⚠️ ' : '✅';
    console.log('  ' + icon + ' ' + s.division.padEnd(18) + ' ' + String(s.agents).padStart(3) + ' agents | ' + String(s.errors).padStart(2) + ' err | ' + String(s.warns).padStart(2) + ' warn | score ' + s.score + '/100');
  }
  console.log('     Score global : ' + globalScore + '/100 | ' + errors.length + ' erreur(s) | ' + warns.length + ' avertissement(s)');
  if (fixes.length > 0) {
    console.log('     🔧 ' + fixes.length + ' fichier(s) corrigé(s) automatiquement');
  }

  if (CI) {
    for (const i of allIssues) {
      if (i.severity === 'ERROR') console.log('::error file=' + i.file + ',title=' + i.code + '::' + i.msg);
      else if (i.severity === 'WARN') console.log('::warning file=' + i.file + ',title=' + i.code + '::' + i.msg);
    }
  }

  if (REPORT) {
    mkdirSync(REPORT_DIR, { recursive: true });
    const md = buildReport(today, stats, globalScore, allIssues, errors, warns, fixes, totalAgents);
    writeFileSync(join(REPORT_DIR, today + '.md'), md);
    writeFileSync(join(REPORT_DIR, 'LATEST.md'), md);
    console.log('     📄 Rapport écrit : docs/reports/maintenance/' + today + '.md (+ LATEST.md)');
  }

  if (errors.length > 0) {
    console.log('\n❌ ' + errors.length + ' erreur(s) bloquante(s) — voir le rapport.');
    process.exit(1);
  }
  console.log('\n✅ Roster sain : aucune erreur bloquante.');
}

function buildReport(date, stats, globalScore, allIssues, errors, warns, fixes, totalAgents) {
  const icon = errors.length > 0 ? '❌' : warns.length > 0 ? '⚠️' : '✅';
  const lines = [];
  lines.push('# 🛡️ Rapport de maintenance quotidienne — ' + date);
  lines.push('');
  lines.push('Généré automatiquement par `scripts/agent-health.mjs` (workflow « 🛡️ Maintenance quotidienne des agents »).');
  lines.push('');
  lines.push('**' + icon + ' Score global : ' + globalScore + '/100** — ' + totalAgents + ' agents analysés — ' + errors.length + ' erreur(s), ' + warns.length + ' avertissement(s).');
  lines.push('');
  lines.push('## Score par division');
  lines.push('');
  lines.push('| Division | Agents | Erreurs | Avertissements | Score |');
  lines.push('|---|---|---|---|---|');
  for (const s of stats) {
    lines.push('| ' + s.division + ' | ' + s.agents + ' | ' + s.errors + ' | ' + s.warns + ' | ' + s.score + '/100 |');
  }
  lines.push('');
  if (errors.length > 0) {
    lines.push('## ❌ Erreurs à corriger');
    lines.push('');
    for (const i of errors) {
      lines.push('- **' + i.code + '** — `' + i.file + '` : ' + i.msg);
    }
    lines.push('');
  }
  if (warns.length > 0) {
    lines.push('## ⚠️ Avertissements');
    lines.push('');
    for (const i of warns) {
      lines.push('- **' + i.code + '** — `' + i.file + '` : ' + i.msg);
    }
    lines.push('');
  }
  if (fixes.length > 0) {
    lines.push('## 🔧 Correctifs automatiques appliqués');
    lines.push('');
    for (const f of fixes) lines.push('- `' + f + '` (BOM / fins de ligne / espaces de fin / newline final)');
    lines.push('');
  }
  if (errors.length === 0 && warns.length === 0) {
    lines.push('## ✅ État');
    lines.push('');
    lines.push('Aucune anomalie détectée. Le roster est sain et robuste.');
    lines.push('');
  }
  lines.push('---');
  lines.push('_Barème : score = 100 − 5×erreurs − 1×avertissements (par division), minimum 0. Score global = moyenne pondérée par nombre d\'agents._');
  lines.push('');
  return lines.join('\n');
}

try {
  main();
} catch (e) {
  console.error('ERREUR inattendue : ' + (e && e.stack ? e.stack : e));
  process.exit(2);
}
