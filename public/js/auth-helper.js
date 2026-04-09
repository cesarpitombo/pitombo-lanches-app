/**
 * auth-helper.js
 * Centraliza a lógica de autenticação e cabeçalhos JWT para o frontend.
 * Fornece a função global window.apiFetch para padronização.
 */

(function() {
    // 1. Verificação de Sessão (Redirecionamento se necessário)
    const token = localStorage.getItem('pitombo_token');
    const isLoginPage = window.location.pathname.includes('/login');
    const isPublicPage = window.location.pathname === '/' || window.location.pathname.includes('/index.html');

    // TEMP: auth desabilitada para testes — reativar: descomentar o bloco abaixo
    /* ORIGINAL — descomentar para reativar:
    if (!token && !isLoginPage && !isPublicPage) {
        console.warn('[Auth] Sessão não encontrada. Redirecionando para login...');
        window.location.href = '/login';
    }
    */

    /**
     * Retorna o cabeçalho de autorização com o token JWT.
     * @returns {Object} Objeto com o header Authorization
     */
    window.authHeader = function() {
        const t = localStorage.getItem('pitombo_token');
        return t ? { 'Authorization': 'Bearer ' + t } : {};
    };

    /**
     * apiFetch: Substituição unificada para o fetch() nativo em chamadas de API.
     * Adiciona automaticamente o Token e trata erros comuns.
     * 
     * @param {string} url - URL da API
     * @param {Object} options - Opções (method, headers, body, etc)
     */
    window.apiFetch = async function(url, options = {}) {
        const headers = {
            ...window.authHeader(),
            ...(options.headers || {})
        };

        // Detecta se o body é um objeto simples (não FormData) para setar JSON
        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            options.body = JSON.stringify(options.body);
            if (!headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }
        }

        try {
            const response = await fetch(url, { ...options, headers });

            // Tratamento global de erros de autenticação
            if (response.status === 401 || response.status === 403) {
                console.error(`[Auth] Acesso negado (${response.status}) para: ${url}`);
                // Opcional: Descomentar se quiser deslogar ao expirar
                // localStorage.removeItem('pitombo_token');
                // if (!isLoginPage) window.location.href = '/login';
            }

            return response;
        } catch (err) {
            console.error(`[API Error] Falha na rede para ${url}:`, err);
            throw err;
        }
    };

    console.log('[Auth] Helper inicializado e apiFetch disponível.');
})();
