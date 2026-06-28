# claude-agent-kit-mz

CLI para **crear agentes (plugins/skills) para la app de Claude desktop**. Genera toda la
estructura "marketplace + plugin" lista para `git push` e instalar en Claude — con un
**asistente interactivo** o por flags. Cross-platform (Windows/Mac/Linux).

```bash
npx claude-agent-kit-mz          # asistente interactivo, sin instalar nada
```

---

## Requisitos
- **Node.js ≥ 18** (probado en Node 24). Eso es todo para *crear* agentes.
- **Git** para publicarlos en GitHub.
- Los agentes que generes **no necesitan Node** en runtime: sus `scripts/.py` corren en el
  sandbox de Claude.

---

## Inicio rápido

### Opción A — sin instalar (recomendada)
```bash
npx claude-agent-kit-mz
```
El asistente te pregunta nombre, qué hace, disparador, usuario de GitHub, etc., y genera el
agente. (Guarda tu usuario/autor en `~/.claude-agent-kit.json` para la próxima vez.)

### Opción B — instalación global
```bash
npm i -g claude-agent-kit-mz
crea-agente            # alias corto
# o:
claude-agent-kit-mz new mi-agente --description "..." --trigger "..."
```

---

## Comandos

### `new [nombre]` — genera un agente
Sin datos suficientes abre el asistente. Por flags (no interactivo):
```bash
npx claude-agent-kit-mz new cotizador \
  --description "Genera cotizaciones en .docx a partir de una lista de precios." \
  --trigger "Úsalo cuando el usuario pegue una lista de precios o pida una cotización." \
  --github-user tu-usuario \
  --out-dir ./agentes
```

Crea:
```
cotizador/
├── .claude-plugin/marketplace.json
├── plugins/cotizador/
│   ├── .claude-plugin/plugin.json
│   └── skills/cotizador/
│       ├── SKILL.md          ← edita aquí el "cerebro" del agente
│       ├── references/.gitkeep
│       └── assets/.gitkeep
└── README.md
```

| Opción | Qué hace |
|---|---|
| `--name <kebab>` | Nombre del agente (también acepta posicional: `new mi-agente`). |
| `--description "<texto>"` | Qué hace, en una línea. |
| `--trigger "<texto>"` | **El disparador** (frontmatter de `SKILL.md`): decide cuándo Claude activa el skill. Sé específico. |
| `--title` / `--repo` | Título legible / nombre del repo (por defecto se derivan del nombre). |
| `--github-user` / `--author` | Por defecto, los guardados en `~/.claude-agent-kit.json`. |
| `--category` / `--keywords "a, b, c"` | Metadatos del marketplace. |
| `--marketplace-name <n>` | Nombre del marketplace (def. `mi-marketplace`). |
| `--license <id>` | Licencia del plugin generado (def. `UNLICENSED`). |
| `--version <x.y.z>` | Versión inicial (def. `0.1.0`). |
| `--out-dir <ruta>` | Dónde crear el repo (def. carpeta actual). |
| `--with-scripts` | Crea `scripts/ejemplo.py`. |
| `--git-init` | `git init` + `git add` en el repo nuevo. |
| `--force` | Sobreescribe si la carpeta existe. |
| `--dry-run` | Muestra qué crearía, sin escribir. |
| `--yes` | No interactivo: usa defaults sin preguntar. |

### `bump <ruta> [version]` — actualizar
La app de Claude cachea el marketplace; para que detecte un cambio hay que subir **todas**
las versiones a la vez (marketplace.json + plugin.json):
```bash
npx claude-agent-kit-mz bump ./agentes/cotizador 0.2.0
# sin versión → incrementa el patch (0.1.0 → 0.1.1)
```

---

## Publicar e instalar (resumen)

1. **GitHub (repo PÚBLICO** — la app no lee privados sin conector):
   ```bash
   cd ./agentes/cotizador
   git init && git add -A && git commit -m "Primer commit"
   git branch -M main
   git remote add origin https://github.com/<usuario>/cotizador.git
   git push -u origin main
   ```
2. **Claude desktop**: “+” → “Agregar plugins…” → pestaña Plugins → “+” (marketplace) →
   pega `usuario/repo` → **Sincronizar** → pestaña Personal → instala el plugin.
3. **Actualizar**: `bump` → push → en la app **Sincronizar** + **Actualizar**. Si “Actualizar”
   sigue gris, elimina y vuelve a agregar el marketplace (caché ~5 min).

---

## Trucos
- El `description` del **SKILL.md** es lo que hace que el agente **se dispare solo**: sé específico.
- Repos de agentes **públicos**; **sube las dos versiones** al actualizar (lo hace `bump`).
- Los `scripts/` corren en el **sandbox** de Claude; usa **rutas relativas** al SKILL.md.

## Desarrollo
```bash
git clone https://github.com/Maximiliano-zm/Kit-tools-A.git
cd Kit-tools-A
npm link                 # expone los comandos localmente
claude-agent-kit-mz --help
```

Licencia: MIT.
