---
name: {{AGENT_NAME}}
description: "{{TRIGGER_DESCRIPTION}}"
---

# {{AGENT_TITLE}}

{{BODY_DESCRIPTION}}

## Archivos incluidos
Todos van junto a este SKILL.md. Refiérelos con **rutas relativas**:
- `scripts/` — (opcional) scripts `.py` que el agente ejecuta en el sandbox.
  Ejemplo de invocación: `python3 scripts/mi_generador.py entrada salida`
- `references/` — (opcional) conocimiento de apoyo (`.md`, `.json`, ejemplos).
- `assets/` — (opcional) plantillas, imágenes u otros recursos.

## Flujo de trabajo
1. Recibe la entrada del usuario.
2. Pregunta lo que no puedas inferir ni inventar (espera la respuesta).
3. Genera o ejecuta lo necesario (instala dependencias con `pip install` si faltan).
4. Valida el resultado y entrega los archivos como descargables.

## Principios
- Responde en español.
- No inventes datos; si falta información, pregunta.
- Sé específico y conciso.
