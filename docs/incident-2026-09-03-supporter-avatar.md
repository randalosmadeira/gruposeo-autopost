# Incidente 1470 - 2026-09-03

Sintoma público: solicitação mostrada como `needs_review` antes de qualquer composição liberada.

Diagnóstico confirmado no banco: os jobs da solicitação `e38c78c0-8c68-45a5-8b00-0d5533088512` encerraram com `anthropic_vision_error:400`. O `internal_selection` permaneceu vazio, comprovando que a execução não chegou ao Candidate Selector/QA final.

As três fotos de entrada eram JPEG e tinham aproximadamente 4 MB cada. O runtime anterior enviava as imagens originais em base64 diretamente ao provedor de visão e não validava se um HTTP 200 do Google Drive era realmente uma imagem.

Correção: cópia reduzida exclusiva para visão, validação de MIME, fallback Anthropic -> OpenAI Vision e separação entre erro de provider e reprovação real de QA. Nenhum threshold de identidade foi reduzido.
