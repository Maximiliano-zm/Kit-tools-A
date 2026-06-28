import fs from 'node:fs';
import path from 'node:path';

function findFiles(dir, filename) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...findFiles(full, filename));
    else if (e.name === filename) out.push(full);
  }
  return out;
}

/**
 * Sube la versión en TODOS los campos "version" de marketplace.json
 * (metadata.version y plugins[].version) y en cada plugin.json, para que
 * la app de Claude detecte la actualización ("truco de las dos versiones").
 *
 * @param {string} repoPath  Carpeta que contiene .claude-plugin/marketplace.json
 * @param {string} [newVersion]  x.y.z; si se omite, incrementa el patch.
 * @returns {{from:string,to:string,changed:string[]}}
 */
export function bumpVersion(repoPath, newVersion) {
  const marketplacePath = path.join(repoPath, '.claude-plugin', 'marketplace.json');
  if (!fs.existsSync(marketplacePath)) {
    throw new Error(`No se encontró marketplace.json en: ${marketplacePath}`);
  }

  let mk = fs.readFileSync(marketplacePath, 'utf8');
  const cur = (mk.match(/"version"\s*:\s*"([^"]+)"/) || [])[1] || '0.0.0';

  if (!newVersion) {
    const p = cur.split('.');
    while (p.length < 3) p.push('0');
    const patch = parseInt(p[2], 10) || 0;
    newVersion = `${p[0]}.${p[1]}.${patch + 1}`;
  }
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(newVersion)) {
    throw new Error(`Versión inválida '${newVersion}'. Usa formato semántico x.y.z sin ceros a la izquierda (ej. 0.2.0).`);
  }

  const changed = [];
  mk = mk.replace(/"version"\s*:\s*"[^"]*"/g, `"version": "${newVersion}"`);
  fs.writeFileSync(marketplacePath, mk, 'utf8');
  changed.push(marketplacePath);

  for (const pf of findFiles(path.join(repoPath, 'plugins'), 'plugin.json')) {
    let raw = fs.readFileSync(pf, 'utf8');
    raw = raw.replace(/"version"\s*:\s*"[^"]*"/g, `"version": "${newVersion}"`);
    fs.writeFileSync(pf, raw, 'utf8');
    changed.push(pf);
  }

  return { from: cur, to: newVersion, changed };
}
