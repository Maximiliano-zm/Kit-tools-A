import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isKebab, toTitle, expandTokens, yamlStr, writeFileUtf8 } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

const SAMPLE_PY = `#!/usr/bin/env python3
"""Script de ejemplo. El agente lo ejecuta en el sandbox de Claude.
Uso: python3 scripts/ejemplo.py [entrada] [salida]
"""
import sys


def main(argv):
    print("Args recibidos:", argv)


if __name__ == "__main__":
    main(sys.argv[1:])
`;

function agentReadme({ title, descriptionLong, githubUser, repo, name }) {
  return [
    `# ${title}`,
    '',
    descriptionLong,
    '',
    '## Instalar en la app de Claude desktop',
    '1. Abre Claude → en el cuadro de mensaje: **"+" → "Agregar plugins…"**',
    '2. Pestaña **"Plugins"** → botón **"+"** (Agregar marketplace).',
    `3. En URL pega: \`${githubUser}/${repo}\` → **Sincronizar**.`,
    `4. Pestaña **"Personal"** → **"+"** para instalar el plugin **${name}**.`,
    '5. El skill se dispara solo al pedir lo que hace, en cualquier chat.',
    '',
    '## Publicar / actualizar',
    `- Primera vez: \`git init\` → commit → push a \`https://github.com/${githubUser}/${repo}\`.`,
    '- El repo DEBE ser **público** (la app no lee repos privados sin conector de GitHub).',
    '- Para que la app detecte cambios, sube **dos versiones** (marketplace.json y plugin.json):',
    `  \`npx claude-agent-kit-mz bump <ruta-a-este-repo>\`, luego **Sincronizar** + **Actualizar** en la app.`,
    '',
    '_Generado con claude-agent-kit-mz._',
    '',
  ].join('\n');
}

/**
 * Construye (en memoria) todos los archivos de un agente nuevo.
 * No escribe nada: devuelve { repoPath, skillDir, files[], meta }.
 */
export function buildAgent(opts = {}) {
  const name = opts.name;
  if (!name) throw new Error('Falta el nombre del agente (usa: new <nombre> o --name).');
  if (!isKebab(name)) {
    throw new Error(`El nombre '${name}' no es kebab-case válido. Usa minúsculas, números y guiones (ej. 'mi-agente').`);
  }

  const title = opts.title || toTitle(name);
  const description = opts.description || 'Qué hace el agente en una línea.';
  const descriptionLong = opts.descriptionLong || description;
  const repo = opts.repo || name;
  if (!isKebab(repo)) {
    throw new Error(`El nombre de repo '${repo}' no es válido. Usa minúsculas, números y guiones (ej. 'mi-repo').`);
  }
  const githubUser = opts.githubUser || '<usuario>';
  const author = opts.author || 'Tu Nombre';
  const marketplaceName = opts.marketplaceName || 'mi-marketplace';
  const marketplaceDescription = opts.marketplaceDescription || 'Marketplace de agentes para Claude desktop.';
  const category = opts.category || 'documentation';
  const version = opts.version || '0.1.0';
  const license = opts.license || 'UNLICENSED';
  const trigger =
    opts.trigger ||
    `${title}. Úsalo cuando el usuario pida: ${description} Incluye palabras clave que deberían dispararlo. Sé específico; esto decide la activación.`;
  const keywords = String(opts.keywords || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const outDir = opts.outDir || process.cwd();
  const repoPath = path.join(outDir, repo);
  const skillDir = path.join(repoPath, 'plugins', name, 'skills', name);

  const files = [];

  // --- marketplace.json (objeto -> JSON, escape garantizado) ---
  const marketplace = {
    name: marketplaceName,
    owner: { name: author, url: `https://github.com/${githubUser}` },
    metadata: { description: marketplaceDescription, version },
    plugins: [
      {
        name,
        source: `./plugins/${name}`,
        description,
        version,
        category,
        keywords: keywords.length ? keywords : ['ejemplo'],
      },
    ],
  };
  files.push({
    path: path.join(repoPath, '.claude-plugin', 'marketplace.json'),
    content: JSON.stringify(marketplace, null, 2) + '\n',
  });

  // --- plugin.json ---
  const plugin = {
    name,
    version,
    description: descriptionLong,
    author: { name: author, url: `https://github.com/${githubUser}` },
    homepage: `https://github.com/${githubUser}/${repo}`,
    repository: `https://github.com/${githubUser}/${repo}`,
    license,
  };
  files.push({
    path: path.join(repoPath, 'plugins', name, '.claude-plugin', 'plugin.json'),
    content: JSON.stringify(plugin, null, 2) + '\n',
  });

  // --- SKILL.md (plantilla + tokens) ---
  let skill = fs.readFileSync(path.join(TEMPLATE_DIR, 'SKILL.md'), 'utf8');
  skill = expandTokens(skill, {
    AGENT_NAME: name,
    AGENT_TITLE: title,
    TRIGGER_DESCRIPTION: yamlStr(trigger),
    BODY_DESCRIPTION: descriptionLong,
  });
  files.push({ path: path.join(skillDir, 'SKILL.md'), content: skill });

  // --- carpetas opcionales (.gitkeep porque git no versiona vacías) ---
  files.push({ path: path.join(skillDir, 'references', '.gitkeep'), content: '' });
  files.push({ path: path.join(skillDir, 'assets', '.gitkeep'), content: '' });

  if (opts.withScripts) {
    files.push({ path: path.join(skillDir, 'scripts', 'ejemplo.py'), content: SAMPLE_PY });
  }

  // --- README del repo del agente ---
  files.push({
    path: path.join(repoPath, 'README.md'),
    content: agentReadme({ title, descriptionLong, githubUser, repo, name }),
  });

  return {
    repoPath,
    skillDir,
    files,
    meta: { name, title, githubUser, repo, version, trigger, author },
  };
}

/** Escribe en disco el plan devuelto por buildAgent(). */
export function writeAgent(plan, { force = false } = {}) {
  if (fs.existsSync(plan.repoPath) && !force) {
    throw new Error(`La carpeta destino ya existe: ${plan.repoPath} (usa --force para sobreescribir).`);
  }
  for (const f of plan.files) writeFileUtf8(f.path, f.content);
}
