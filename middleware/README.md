# middleware

Esta pasta conterá os middlewares da aplicação — funções executadas entre a requisição e o controller.

Serão criados nas próximas etapas:
- `auth.js`        → verifica o token JWT e protege rotas de admin
- `errorHandler.js`→ captura erros globais e retorna respostas padronizadas
