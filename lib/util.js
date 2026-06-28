import fs from 'node:fs';
import path from 'node:path';

/** ¿Es kebab-case válido? (minúsculas, números y guiones simples) */
export function isKebab(name) {
  return typeof name === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

/** "mi-agente" -> "Mi Agente" */
export function toTitle(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join(' ');
}

/**
 * Escapa un texto para incrustarlo dentro de un string entre comillas dobles
 * de YAML (frontmatter de SKILL.md). \" y \\ son escapes válidos en YAML
 * double-quoted y en JSON.
 */
export function yamlStr(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/** Reemplaza {{TOKEN}} por su valor (literal, sin regex). */
export function expandTokens(text, map) {
  for (const [k, v] of Object.entries(map)) {
    text = text.split('{{' + k + '}}').join(v == null ? '' : String(v));
  }
  return text;
}

/** Escribe un archivo en UTF-8 sin BOM (Node lo hace por defecto), creando carpetas. */
export function writeFileUtf8(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}
