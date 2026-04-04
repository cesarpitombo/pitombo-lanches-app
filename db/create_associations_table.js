const { query } = require('./connection');

async function migrate() {
    try {
        console.log('Iniciando migração de banco de dados para Associações de Modificadores...');

        // Criar tabela de associação Categoria de Produto <-> Grupo de Modificador
        await query(`
            CREATE TABLE IF NOT EXISTS categoria_modificadores (
                categoria_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
                modificador_categoria_id INTEGER REFERENCES modificador_categorias(id) ON DELETE CASCADE,
                PRIMARY KEY (categoria_id, modificador_categoria_id)
            );
        `);
        console.log('Tabela categoria_modificadores verificada/criada.');

        // Adicionar colunas em produtos
        await query(`ALTER TABLE produtos ADD COLUMN IF NOT EXISTS custo NUMERIC(10, 2) DEFAULT 0;`);
        await query(`ALTER TABLE produtos ADD COLUMN IF NOT EXISTS desconto NUMERIC(10, 2) DEFAULT 0;`);
        await query(`ALTER TABLE produtos ADD COLUMN IF NOT EXISTS sku VARCHAR(50);`);
        await query(`ALTER TABLE produtos ADD COLUMN IF NOT EXISTS preco_embalagem NUMERIC(10, 2) DEFAULT 0;`);
        
        console.log('Colunas custo, desconto, sku, preco_embalagem verificadas/criadas em produtos.');

        console.log('Migração concluída com sucesso!');
        process.exit(0);
    } catch (error) {
        console.error('Erro na migração:', error);
        process.exit(1);
    }
}

migrate();
