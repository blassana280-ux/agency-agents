#!/usr/bin/env node
// agent-reinforce.mjs — Renforcement quotidien des agents DANS leur spécialité.
// Zéro dépendance externe (Node >= 18, fetch global requis).
//
// Chaque jour, sélectionne les agents les moins récemment renforcés (rotation
// complète du roster) et demande à un LLM (API Mistral) de renforcer CHAQUE
// agent dans SA spécialité propre : nouvelles capacités concrètes, techniques
// état de l'art, scénarios avancés — en préservant frontmatter, identité,
// personnalité et contenu existant.
//
// Les fichiers modifiés sont ensuite commités et proposés en PR par le
// workflow (jamais poussés directement sur main sans revue).
//
// Usage (dans le workflow quotidien, ou manuel) :
//   MISTRAL_API_KEY=... node scripts/agent-reinforce.mjs
//
// Environnement :
//   MISTRAL_API_KEY      requis — secret GitHub (console Mistral). Sans la
//                        clé, le script sort proprement (exit 0, skip).
//   MISTRAL_MODEL        optionnel — défaut : mistral-large-latest
//   MISTRAL_API_URL     optionnel — override de l'endpoint
//   REINFORCE_PER_DAY    optionnel — agents renforcés par jour (défaut : 10)
//
// Codes de sortie : 0 = OK (ou skip sans clé), 1 = au moins un échec.

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIVISIONS_FILE = join(ROOT, 'divisions.json');
const REPORT_DIR = join(ROOT, 'docs', 'reports', 'maintenance');
const STATE_FILE = join(REPORT_DIR, 'reinforcement-state.json');
const REPORT_FILE = join(REPORT_DIR, 'REINFORCEMENT.md');

const API_KEY = process.env.MISTRAL_API_KEY || '';
const MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';
const API_URL = process.env.MISTRAL_API_URL || 'https://api.mistral.ai/v1/chat/completions';
const PER_DAY = Math.max(1, parseInt(process.env.REINFORCE_PER_DAY || '10', 10) || 10);
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

// Nom déclaré dans le frontmatter (pour valider la réponse du modèle).
function fmName(text) {
  if (!text.startsWith('---\n')) return null;
  const lines = text.split('\n');
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break;
    const m = /^name:\s*(.*)$/.exec(lines[i]);
    if (m) return unquote(m[1]);
  }
  return null;
}

// Certains modèles enveloppent le document dans un bloc de code : l'enlever.
function stripWrappingFence(s) {
  const t = s.trim();
  if (t.startsWith('```')) {
    const first = t.indexOf('\n');
    if (first !== -1 && t.endsWith('```')) {
      return t.slice(first + 1, t.length - 3).trim() + '\n';
    }
  }
  return t;
}

function loadState() {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return s && typeof s === 'object' && s.agents ? s : { agents: {} };
  } catch {
    return { agents: {} };
  }
}

// ---------------------------------------------------------------------------
// Sélection : les agents jamais renforcés d'abord, puis les plus anciens
// ---------------------------------------------------------------------------

function listAgents(divisionDirs) {
  const agents = [];
  for (const d of divisionDirs) {
    for (const abs of walk(join(ROOT, d)).sort()) {
      const rel = relative(ROOT, abs);
      const stem = rel.split('/').pop().replace(/\.md$/, '');
      agents.push({ rel, division: d, stem, abs });
    }
  }
  return agents;
}

function selectForToday(agents, state) {
  const never = agents.filter((a) => !state.agents[a.stem]);
  const already = agents
    .filter((a) => state.agents[a.stem])
    .sort(
      (a, b) =>
        (state.agents[a.stem].lastReinforced || '').localeCompare(state.agents[b.stem].lastReinforced || '') ||
        a.stem.localeCompare(b.stem)
    );
  return never.concat(already).slice(0, PER_DAY);
}

// ---------------------------------------------------------------------------
// Appel LLM — renforcement dans la spécialité
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = [
  'You are an expert agent-reinforcement engine for the "agency-agents" repository.',
  'Your job: strengthen an expert AI agent profile IN ITS OWN SPECIALTY, so it stays sharper than any generalist.',
  'Strict rules:',
  '1. Preserve the YAML frontmatter EXACTLY as given (name, description, color, emoji, vibe) — character for character.',
  '2. Preserve the agent identity, personality, and voice. Never delete or weaken existing sections.',
  '3. Add: up to 5 NEW capabilities, techniques, mental models, checklists, or 2026 state-of-the-art practices SPECIFIC to this agent specialty — concrete and actionable, zero generic filler.',
  '4. Extend the single most relevant existing workflow with ONE advanced scenario (edge case, failure mode, or expert-level procedure).',
  '5. Append at the very end a section "## ⚡ Daily Reinforcement Log" containing exactly one new bullet: "- ' + today + ': <one-line summary of what was added>". If that section already exists, append the bullet to it instead of creating a new one.',
  '6. Keep the SAME LANGUAGE as the input document.',
  '7. Output ONLY the complete updated Markdown file. No commentary, no wrapping code fence.',
].join('\n');

async function callMistral(agentText, divisionLabel) {
  const userPrompt =
    'Division: ' + divisionLabel + '\n\nReinforce this agent in its specialty:\n\n' + agentText;
  const body = JSON.stringify({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 12000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  let lastErr = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + API_KEY,
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(180000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error('HTTP ' + res.status + ' ( tentative ' + attempt + ' )');
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 300);
        throw new Error('HTTP ' + res.status + ' : ' + errText);
      }
      const data = await res.json();
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!content) throw new Error('réponse vide de l’API');
      return content;
    } catch (e) {
      lastErr = e;
      if (attempt === 2) break;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr || new Error('échec inconnu');
}

// Garde-fous avant d'écrire un fichier renforcé.
function validateReinforcement(original, output) {
  const problems = [];
  const out = stripWrappingFence(output);
  if (!out.startsWith('---\n')) problems.push('la réponse ne commence pas par le frontmatter');
  const name = fmName(original);
  const outName = fmName(out);
  if (name && outName && name.toLowerCase() !== outName.toLowerCase()) {
    problems.push('le nom a changé (« ' + name + ' » → « ' + outName + ' »)');
  }
  if (out.trim().length < original.trim().length * 0.7) {
    problems.push('la réponse est plus courte que 70% de l’original (truncation probable)');
  }
  if (!out.includes('Daily Reinforcement Log')) {
    problems.push('section « Daily Reinforcement Log » absente');
  }
  if (/(api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{12,}["']/i.test(out)) {
    problems.push('valeur ressemblant à un secret détectée');
  }
  return { ok: problems.length === 0, text: out, problems };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!API_KEY) {
    console.log('ℹ️ MISTRAL_API_KEY absent — renforcement métier ignoré pour aujourd’hui.');
    process.exit(0);
  }
  if (!existsSync(DIVISIONS_FILE)) {
    console.error('ERREUR: divisions.json introuvable.');
    process.exit(1);
  }
  let divisions;
  try {
    divisions = JSON.parse(readFileSync(DIVISIONS_FILE, 'utf8'));
  } catch (e) {
    console.error('ERREUR: divisions.json illisible : ' + e.message);
    process.exit(1);
  }
  const divisionDirs = Object.keys(divisions.divisions || {});
  const labels = {};
  for (const [k, v] of Object.entries(divisions.divisions || {})) {
    labels[k] = v && v.label ? v.label : k;
  }

  const agents = listAgents(divisionDirs);
  if (agents.length === 0) {
    console.log('Aucun agent trouvé — rien à renforcer.');
    process.exit(0);
  }

  const state = loadState();
  const selected = selectForToday(agents, state);
  console.log('');
  console.log('⚡ Renforcement métier — ' + today);
  console.log('   Roster : ' + agents.length + ' agents | ' + selected.length + ' agent(s) à renforcer aujourd’hui (rotation ' + PER_DAY + '/jour).');

  const results = [];
  for (const a of selected) {
    const original = readFileSync(a.abs, 'utf8');
    try {
      const raw = await callMistral(original, labels[a.division] || a.division);
      const { ok, text, problems } = validateReinforcement(original, raw);
      if (!ok) {
        console.log('   ⚠️ ' + a.stem + ' — réponse rejetée (' + problems.join(' ; ') + ')');
        results.push({ stem: a.stem, division: a.division, rel: a.rel, ok: false, error: problems.join(' ; ') });
        continue;
      }
      writeFileSync(a.abs, text);
      state.agents[a.stem] = { lastReinforced: today, division: a.division };
      const logMatch = text.match(new RegExp('- ' + today + ': (.+)'));
      results.push({
        slug: a.stem,
        stem: a.stem,
        division: a.division,
        rel: a.rel,
        ok: true,
        summary: logMatch ? logMatch[1].trim() : 'renforcé dans sa spécialité',
      });
      console.log('   ✅ ' + a.stem + ' — renforcé');
    } catch (e) {
      console.log('   ❌ ' + a.stem + ' — ' + (e && e.message ? e.message : e));
      results.push({ slug: a.stem, stem: a.stem, division: a.division, rel: a.rel, ok: false, error: String(e && e.message ? e.message : e) });
    }
  }

  // Sauvegardes : état + rapport
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  writeFileSync(REPORT_FILE, buildReport(results, okCount, failCount));
  console.log('   📄 Rapport : docs/reports/maintenance/REINFORCEMENT.md');
  console.log('   Bilan : ' + okCount + ' renforcé(s), ' + failCount + ' échec(s).');

  if (failCount > 0) process.exit(1);
  process.exit(0);
}

function buildReport(results, okCount, failCount) {
  const lines = [];
  lines.push('# ⚡ Rapport de renforcement des spécialités — ' + today);
  lines.push('');
  lines.push('Généré automatiquement par `scripts/agent-reinforce.mjs`. Chaque agent est renforcé **dans sa propre spécialité** (nouvelles capacités concrètes, techniques 2026, scénario avancé), avec frontmatter, identité et contenu existant préservés.');
  lines.push('');
  lines.push('**Bilan : ' + okCount + ' agent(s) renforcé(s)' + (failCount > 0 ? ', ' + failCount + ' échec(s)' : '') + '.** Rotation : ' + PER_DAY + ' agents/jour.');
  lines.push('');
  lines.push('| Agent | Division | Ajout du jour | État |');
  lines.push('|---|---|---|---|');
  for (const r of results) {
    const summary = (r.ok ? r.summary : r.error).replace(/\|/g, '/');
    lines.push('| `' + r.stem + '` | ' + r.division + ' | ' + summary + ' | ' + (r.ok ? '✅' : '❌') + ' |');
  }
  lines.push('');
  lines.push('---');
  lines.push('_Merger ce PR fusionne les renforcements dans `main`. L’historique par agent est dans le « Daily Reinforcement Log » de chaque fichier et dans `reinforcement-state.json`._');
  lines.push('');
  return lines.join('\n');
}

main().catch((e) => {
  console.error('ERREUR inattendue : ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
