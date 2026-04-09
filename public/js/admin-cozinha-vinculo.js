/**
 * admin-cozinha-vinculo.js
 * Lógica para vincular produtos às cozinhas
 */

const CozinhaVinculoManager = {
    cozinhas: [],

    async init() {
        console.log('🍳 Inicializando CozinhaVinculoManager...');
        await this.load();
    },

    async load() {
        try {
            const res = await apiFetch('/api/cozinhas');
            this.cozinhas = await res.json();
            this.updateSelects();
        } catch (err) {
            console.error('Erro ao carregar cozinhas para vínculo:', err);
        }
    },

    updateSelects() {
        const selects = document.querySelectorAll('#select-cozinha-produto');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Cozinha Principal</option>';
            this.cozinhas.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.nome;
                select.appendChild(opt);
            });
            select.value = currentValue;
        });
    }
};

window.CozinhaVinculoManager = CozinhaVinculoManager;
