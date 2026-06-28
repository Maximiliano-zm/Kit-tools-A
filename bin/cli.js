#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { execFileSync } from 'node:child_process';
import { buildAgent, writeAgent } from '../lib/scaffold.js';
import { bumpVersion } from '../lib/bump.js';
import { isKebab } from '../lib/util.js';

const PKG = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const CONFIG_PATH = path.join(os.homedir(), '.claude-agent-kit.json');

// 'version' NO va aquí: como flag de 'new'/'bump' toma valor (--version x.y.z);
// como flag global (sin valor) se resuelve en main().
const BOOLEAN = new Set(['dryRun', 'withScripts', 'gitInit', 'force', 'yes', 'help']);
// Flags que admiten ir CON o SIN valor (--version x.y.z, o --version solo = mostrar versión).
const OPTIONAL_VALUE = new Set(['version']);
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      let raw = a.slice(2);
      let val;
      const eq = raw.indexOf('=');
      if (eq !== -1) {
        val = raw.slice(eq + 1);
        raw = raw.slice(0, eq);
      }
      const key = camel(raw);
      if (val === undefined) {
        if (BOOLEAN.has(key)) val = true;
        else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) val = argv[++i];
        else if (OPTIONAL_VALUE.has(key)) val = true;
        else throw new Error(`La opción --${raw} necesita un valor (ej. --${raw} <valor>).`);
      }
      flags[key] = val;
    } else if (a === '-h') {
      flags.help = true;
    } else if (a === '-v') {
      flags.version = true;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

function help() {
  console.log(`
claude-agent-kit-mz v${PKG.version}
Crea agentes (plugins/skills) para la app de Claude desktop.

USO
  npx claude-agent-kit-mz [comando] [opciones]
  crea-agente [comando] [opciones]          (alias tras 'npm i -g')

COMANDOS
  new [nombre]      Genera un agente nuevo. Sin datos suficientes abre el
                    asistente interactivo.
  bump <ruta> [v]   Sube la versión en marketplace.json y plugin.json a la vez.
                    Sin <v>, incrementa el patch (0.1.0 -> 0.1.1).
  help              Muestra esta ayuda.
  version           Muestra la versión.

OPCIONES de 'new'
  --name <kebab>            Nombre del agente (minúsculas-con-guiones).
  --description "<texto>"   Qué hace, en una línea.
  --trigger "<texto>"       Disparador (frontmatter de SKILL.md): decide cuándo
                            Claude activa el skill. Si se omite, se arma del --description.
  --title "<texto>"         Título legible (por defecto se deriva del nombre).
  --repo <nombre>           Nombre del repo (por defecto = nombre del agente).
  --github-user <user>      Usuario de GitHub (por defecto: config guardada).
  --author "<nombre>"       Autor (por defecto: config guardada).
  --category <cat>          Categoría del marketplace (def. documentation).
  --keywords "a, b, c"      Palabras clave.
  --marketplace-name <n>    Nombre del marketplace (def. mi-marketplace).
  --license <id>            Licencia del plugin generado (def. UNLICENSED).
  --version <x.y.z>         Versión inicial (def. 0.1.0).
  --out-dir <ruta>          Dónde crear el repo (def. carpeta actual).
  --with-scripts            Crea scripts/ejemplo.py de muestra.
  --git-init                Ejecuta git init + add en el repo nuevo.
  --force                   Sobreescribe si la carpeta existe.
  --dry-run                 Muestra qué crearía, sin escribir.
  --yes                     No interactivo: usa defaults sin preguntar.

EJEMPLOS
  npx claude-agent-kit-mz
  npx claude-agent-kit-mz new cotizador --description "Genera cotizaciones" --trigger "Cuando pidan una cotización." --out-dir ./agentes
  crea-agente bump ./agentes/cotizador 0.2.0
`);
}

function yn(v, def = false) {
  if (v === undefined || v === '') return def;
  return /^(s|si|sí|y|yes|true|1)$/i.test(String(v).trim());
}

/**
 * Lector de líneas robusto para TTY y para stdin por pipe. Bufferiza las
 * líneas que llegan (evita la pérdida de líneas de readline/promises con
 * entrada no-TTY). ask() devuelve la siguiente línea, o null en EOF.
 */
function createPrompter() {
  const rl = readline.createInterface({ input, output });
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (line) => {
    const w = waiters.shift();
    if (w) w(line);
    else queue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  return {
    ask(promptText) {
      if (promptText) output.write(promptText);
      if (queue.length) return Promise.resolve(queue.shift());
      if (closed) return Promise.resolve(null);
      return new Promise((resolve) => waiters.push(resolve));
    },
    close() {
      rl.close();
    },
  };
}

async function runWizard(flags, cfg) {
  const p = createPrompter();
  const ask = async (q, def) => {
    const raw = await p.ask(def ? `${q} [${def}]: ` : `${q}: `);
    if (raw === null) return def || '';
    return raw.trim() || def || '';
  };

  console.log('\n🧩  Asistente para crear un agente de Claude desktop\n');

  let name = flags.name;
  while (!isKebab(name)) {
    const raw = await p.ask('Nombre del agente (kebab-case, ej. mi-agente): ');
    if (raw === null) {
      p.close();
      throw new Error('No hay entrada interactiva. Usa: new <nombre> --description "..." (o --yes).');
    }
    name = raw.trim();
    if (!isKebab(name)) console.log('   ⚠  Usa minúsculas, números y guiones (sin espacios ni mayúsculas).');
  }

  const description = flags.description || (await ask('¿Qué hace? (una línea)', 'Qué hace el agente.'));
  const trigger =
    flags.trigger || (await ask('Disparador (¿cuándo activarlo?)', `Úsalo cuando el usuario pida: ${description}`));
  const githubUser = flags.githubUser || (await ask('Usuario de GitHub', cfg.githubUser || '<usuario>'));
  const author = flags.author || (await ask('Autor', cfg.author || 'Tu Nombre'));
  const outDir = flags.outDir || (await ask('¿Dónde crear el repo?', process.cwd()));
  const withScripts =
    flags.withScripts !== undefined ? true : yn(await ask('¿Incluir carpeta scripts/ con ejemplo.py? (s/N)', 'N'));
  const gitInit =
    flags.gitInit !== undefined ? true : yn(await ask('¿Ejecutar git init en el repo nuevo? (s/N)', 'N'));

  p.close();

  // Recordar usuario/autor para la próxima vez (salvo en dry-run: no debe tener efectos)
  if (!flags.dryRun && (githubUser !== cfg.githubUser || author !== cfg.author)) {
    if (saveConfig({ ...cfg, githubUser, author })) {
      console.log(`   (guardé usuario y autor en ${CONFIG_PATH})`);
    }
  }

  // Propaga también los flags que el asistente no pregunta, para no perderlos.
  return {
    name,
    description,
    trigger,
    githubUser,
    author,
    outDir,
    withScripts,
    gitInit,
    title: flags.title,
    repo: flags.repo,
    category: flags.category,
    keywords: flags.keywords,
    version: typeof flags.version === 'string' ? flags.version : undefined,
    license: flags.license,
    marketplaceName: flags.marketplaceName,
  };
}

function gitInitRepo(repoPath) {
  try {
    execFileSync('git', ['init'], { cwd: repoPath, stdio: 'ignore' });
    execFileSync('git', ['add', '-A'], { cwd: repoPath, stdio: 'ignore' });
    console.log('   • git init + add realizados (falta commit/push).');
    return true;
  } catch (e) {
    console.warn(`   ⚠  git init falló: ${e.message}`);
    return false;
  }
}

function printNextSteps(plan) {
  const { meta, repoPath, skillDir } = plan;
  console.log(`\n✅  Agente '${meta.name}' creado en:\n    ${repoPath}\n`);
  console.log('Siguientes pasos:');
  console.log(`  1) Edita el cerebro del agente:\n       ${path.join(skillDir, 'SKILL.md')}`);
  console.log('  2) Publica en GitHub (repo PÚBLICO):');
  console.log(`       cd "${repoPath}"`);
  console.log('       git init && git add -A && git commit -m "Primer commit"');
  console.log('       git branch -M main');
  console.log(`       git remote add origin https://github.com/${meta.githubUser}/${meta.repo}.git`);
  console.log('       git push -u origin main');
  console.log('  3) En Claude desktop: + → Agregar plugins → + (marketplace) →');
  console.log(`       pega  ${meta.githubUser}/${meta.repo}  → Sincronizar → instala '${meta.name}'.`);
  console.log('');
  console.log('💡  Tip: para tareas complejas con tu agente, pídele que planifique primero');
  console.log('    (modo /plan) y aprueba el plan antes de ejecutar.');
  console.log('');
}

async function cmdNew(positionals, flags) {
  const cfg = loadConfig();
  const nameArg = positionals[0];
  const haveName = !!(flags.name || nameArg);
  const nonInteractive = !!(flags.yes || flags.description || flags.trigger);

  if (flags.yes && !haveName) {
    throw new Error('Falta el nombre del agente: usa `new <nombre>` o --name <kebab>.');
  }

  let opts;
  if (haveName && nonInteractive) {
    opts = {
      name: flags.name || nameArg,
      description: flags.description,
      trigger: flags.trigger,
      title: flags.title,
      repo: flags.repo,
      githubUser: flags.githubUser || cfg.githubUser,
      author: flags.author || cfg.author,
      marketplaceName: flags.marketplaceName || cfg.marketplaceName,
      category: flags.category,
      keywords: flags.keywords,
      version: typeof flags.version === 'string' ? flags.version : undefined,
      license: flags.license || cfg.license,
      outDir: flags.outDir,
      withScripts: flags.withScripts !== undefined,
    };
  } else {
    if (nameArg && !flags.name) flags.name = nameArg;
    opts = await runWizard(flags, cfg);
  }

  const plan = buildAgent(opts);

  if (flags.dryRun) {
    console.log(`\n[dry-run] Se crearían en ${plan.repoPath}:`);
    for (const f of plan.files) console.log('  - ' + path.relative(plan.repoPath, f.path).split(path.sep).join('/'));
    console.log('[dry-run] No se escribió nada.');
    return;
  }

  writeAgent(plan, { force: !!flags.force });
  if (opts.gitInit || flags.gitInit) gitInitRepo(plan.repoPath);
  printNextSteps(plan);
}

function cmdBump(positionals, flags) {
  const repoPath = positionals[1];
  if (!repoPath) throw new Error('Uso: bump <ruta-al-repo> [version]');
  const version = positionals[2] || (typeof flags.version === 'string' ? flags.version : undefined);
  const r = bumpVersion(repoPath, version);
  console.log(`Versión: ${r.from} → ${r.to}`);
  for (const f of r.changed) console.log('  + ' + f);
  console.log(`\nAhora:  git add -A && git commit -m "v${r.to}" && git push`);
  console.log('Luego en la app: Sincronizar el marketplace (···) y Actualizar el plugin.');
  console.log('Si "Actualizar" sigue gris, elimina y vuelve a agregar el marketplace (caché ~5 min).');
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const cmd = positionals[0];

  if (flags.help || cmd === 'help') return void help();
  if (cmd === 'version' || (flags.version === true && cmd !== 'new' && cmd !== 'bump')) {
    return void console.log(PKG.version);
  }
  if (cmd === 'bump') return void cmdBump(positionals, flags);
  if (cmd === 'new') return void (await cmdNew(positionals.slice(1), flags));

  // Por defecto: 'new'. Un positional inicial (que no es comando) es el nombre.
  await cmdNew(positionals, flags);
}

main().catch((e) => {
  console.error('✖  ' + e.message);
  process.exit(1);
});
