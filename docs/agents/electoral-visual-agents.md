# Agentes editoriais do Zica.ai

## NEXUS ELEITORAL 1470
- prompt_template: `electoral_editorial_1470_v1`
- target: `content_variations`
- corpus: `electoral_agent_content_context`
- regras: factualidade, fonte primária quando exigida, revisão humana, sem microtargeting ou personalização política individual.

## NEXUS VISUAL STUDIO
- prompt_template: `visual_content_master_v1`
- target: `image_generator`
- motor visual: OpenAI `gpt-image-2`
- revisor de prompt: Claude `claude-sonnet-4-6`
- presets: legal, criminal, consumer, health, business, labor, electoral, news, fintech, education e general.
