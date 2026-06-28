# Kit-tools-Agentes

Kit local para **crear agentes (plugins/skills) para Claude desktop** siguiendo la receta
"marketplace + plugin en GitHub". Con un solo comando genera toda la estructura de un agente
nuevo, lista para `git push` e instalar en la app de Claude.

---

## ¿Qué incluye?

```
Kit-tools-Agentes/
├── kit.config.json          ← tus defaults (usuario GitHub, autor, licencia…)
├── templates/               ← plantillas con marcadores {{...}}
│   ├── marketplace.json
│   ├── plugin.json
│   └── SKILL.md
├── tools/
│   ├── new-agent.ps1        ← genera un agente nuevo
│   └── bump-version.ps1     ← sube la versión en todos los archivos (para actualizar)
└── README.md
```

> Requisitos: **Git** instalado. **PowerShell** (viene con Windows). No necesitas Python
> en tu PC: los `scripts/.py` del agente corren en el sandbox de Claude.

---

## 1) Configura tus defaults (una sola vez)

Edita `kit.config.json` y pon tu usuario de GitHub y tu nombre:

```json
{
  "githubUser": "tu-usuario",
  "authorName": "Tu Nombre",
  "marketplaceName": "gama-marketplace",
  "license": "UNLICENSED",
  "defaultCategory": "documentation",
  "defaultVersion": "0.1.0"
}
```

Estos valores se usan como predeterminados al generar cada agente (puedes
sobreescribirlos por parámetro en cada llamada).

---

## 2) Crea un agente nuevo

Desde la carpeta del kit:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\new-agent.ps1 `
  -Name mi-agente `
  -Description "Genera cotizaciones en .docx a partir de una lista de precios." `
  -Trigger "Úsalo cuando el usuario pegue una lista de precios o pida una cotización." `
  -OutDir C:\Users\mz\Desktop\agentes
```

Esto crea `C:\Users\mz\Desktop\agentes\mi-agente\` con la estructura completa:

```
mi-agente/
├── .claude-plugin/marketplace.json
├── plugins/mi-agente/
│   ├── .claude-plugin/plugin.json
│   └── skills/mi-agente/
│       ├── SKILL.md          ← edita aquí el "cerebro" del agente
│       ├── references/.gitkeep
│       └── assets/.gitkeep
└── README.md
```

### Parámetros de `new-agent.ps1`

| Parámetro | Obligatorio | Qué hace |
|---|---|---|
| `-Name` | **Sí** | Nombre del agente en kebab-case (`mi-agente`). |
| `-Description` | No | Qué hace, en una línea (va a marketplace.json y plugin.json). |
| `-Trigger` | No | El **disparador** (frontmatter `description` del SKILL.md). Decide cuándo Claude activa el skill. Si se omite, se arma desde `-Description`. |
| `-Title` | No | Título legible del SKILL.md (por defecto se deriva del `-Name`). |
| `-Repo` | No | Nombre del repo (por defecto = `-Name`). |
| `-GitHubUser` / `-Author` | No | Sobreescriben los de `kit.config.json`. |
| `-Category` / `-Keywords` | No | Metadatos del marketplace. `-Keywords "a, b, c"`. |
| `-Version` | No | Versión inicial (por defecto `0.1.0`). |
| `-OutDir` | No | Dónde crear el repo (por defecto la carpeta actual). |
| `-WithScripts` | No | Crea `scripts/ejemplo.py` de muestra. |
| `-GitInit` | No | Ejecuta `git init` + `git add` en el repo nuevo. |
| `-Force` | No | Sobreescribe si la carpeta ya existe. |
| `-DryRun` | No | Muestra qué crearía, sin escribir nada. |

> Lo más importante es el **`-Trigger`**: es el texto que lee Claude para decidir si
> activa el skill solo. Sé específico e incluye palabras clave (“cuando el usuario pegue X”,
> “pida Y”).

---

## 3) Publica en GitHub  ⚠️ el repo DEBE ser PÚBLICO

La app de escritorio **no lee repos privados** (salvo conector de GitHub de la organización).

```bash
cd C:\Users\mz\Desktop\agentes\mi-agente
git init
git add -A
git commit -m "Primer agente: mi-agente"
git branch -M main
git remote add origin https://github.com/<usuario>/mi-agente.git
git push -u origin main
```

(Con el CLI `gh`: `gh repo create <usuario>/mi-agente --public --source=. --push`.)

---

## 4) Instala en la app de Claude desktop

1. Claude → en el cuadro de mensaje: **“+” → “Agregar plugins…”**.
2. Pestaña **“Plugins”** → botón **“+”** (Agregar marketplace).
3. En URL pega `usuario/repo` (ej. `mi-usuario/mi-agente`) → **Sincronizar**.
4. Pestaña **“Personal”** → **“+”** para **instalar** el plugin.
5. Listo: el skill se dispara solo al pedir lo que hace, en cualquier chat.

---

## 5) Actualiza el agente más adelante

Cuando edites el agente, la app no detecta el cambio si no subes la versión.
Usa el helper para subir **todas** las versiones a la vez:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\bump-version.ps1 `
  -RepoPath C:\Users\mz\Desktop\agentes\mi-agente -NewVersion 0.2.0
# (sin -NewVersion incrementa el patch: 0.1.0 -> 0.1.1)
```

Luego:

```bash
git add -A && git commit -m "v0.2.0" && git push
```

En la app: en el chip del marketplace **`···` → Sincronizar**, y en el plugin **“Actualizar”**.
Si “Actualizar” sigue gris, **elimina y vuelve a agregar** el marketplace (la caché de
GitHub tarda ~5 min en propagar).

---

## Trucos aprendidos

- **Privado no funciona** sin conector de GitHub → repo **público**.
- **Sube las dos versiones** (marketplace.json *y* plugin.json) para forzar el refresh →
  `bump-version.ps1` lo hace por ti.
- El `description` del **SKILL.md** es clave para que el agente **se dispare solo**.
- Los `scripts/` corren en el **sandbox** de Claude; referencia archivos con **rutas
  relativas** al SKILL.md.
- Confirma que la app puede **crear archivos** (genera un `.docx` de prueba) antes de
  depender de eso.
- Si PowerShell bloquea el script, llámalo con `-ExecutionPolicy Bypass` (como arriba).
