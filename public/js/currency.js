window.AppCurrency = {
    code: 'BRL',
    symbol: 'R$',
    
    async init() {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                this.code = data.currency_code || 'BRL';
                this.updateSymbol();
                this.updateUI();
            }
        } catch(e) {
            console.error('Erro ao carregar moeda:', e);
        }
    },
    
    updateSymbol() {
        const map = {
            'BRL': 'R$', 'USD': '$', 'EUR': '€', 'GBP': '£', 
            'AOA': 'Kz', 'MZN': 'MT', 'CVE': '$', 'ARS': '$',
            'CLP': '$', 'COP': '$', 'PEN': 'S/', 'BOB': 'Bs.'
        };
        this.symbol = map[this.code] || this.code;
    },
    
    format(value) {
        const num = Number(value) || 0;
        if (this.code === 'BRL' || this.code === 'EUR' || this.code === 'AOA' || this.code === 'MZN' || this.code === 'CVE') {
            return `${this.symbol} ${num.toFixed(2).replace('.', ',')}`;
        }
        return `${this.symbol} ${num.toFixed(2)}`;
    },
    
    updateUI() {
        // Atualiza elementos estáticos na UI
        document.querySelectorAll('.currency-symbol').forEach(el => {
            el.textContent = this.symbol;
        });
    }
};

// Iniciar loading da configuração
window.AppCurrency.init();

// Função helper global
window.formatCurrency = function(val) {
    return window.AppCurrency.format(val);
};
