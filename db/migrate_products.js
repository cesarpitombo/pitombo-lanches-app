const { query } = require('./connection');

async function migrate() {
    console.log('🚀 Iniciando migração de produtos...');

    try {
        // 1. Criar tabela de categorias
        await query(`
            CREATE TABLE IF NOT EXISTS categorias (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                ordem INTEGER DEFAULT 0,
                ativo BOOLEAN DEFAULT TRUE,
                is_destaque BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ Tabela "categorias" verificada.');

        // 2. Criar tabela de variantes
        await query(`
            CREATE TABLE IF NOT EXISTS produto_variantes (
                id SERIAL PRIMARY KEY,
                produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
                nome VARCHAR(100) NOT NULL,
                preco NUMERIC(10, 2) NOT NULL DEFAULT 0,
                custo NUMERIC(10, 2) DEFAULT 0,
                desconto NUMERIC(10, 2) DEFAULT 0,
                sku VARCHAR(100),
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ Tabela "produto_variantes" verificada.');

        // 3. Criar tabelas de modificadores
        await query(`
            CREATE TABLE IF NOT EXISTS modificador_categorias (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                obrigatorio BOOLEAN DEFAULT FALSE,
                selecao_unica BOOLEAN DEFAULT FALSE,
                min_escolhas INTEGER DEFAULT 0,
                max_escolhas INTEGER DEFAULT 1,
                criado_em TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ Tabela "modificador_categorias" verificada.');

        await query(`
            CREATE TABLE IF NOT EXISTS modificador_itens (
                id SERIAL PRIMARY KEY,
                categoria_id INTEGER REFERENCES modificador_categorias(id) ON DELETE CASCADE,
                nome VARCHAR(100) NOT NULL,
                preco NUMERIC(10, 2) NOT NULL DEFAULT 0,
                custo NUMERIC(10, 2) DEFAULT 0,
                desconto NUMERIC(10, 2) DEFAULT 0,
                sku VARCHAR(100),
                ativo BOOLEAN DEFAULT TRUE,
                ordem INTEGER DEFAULT 0
            )
        `);
        console.log('✅ Tabela "modificador_itens" verificada.');

        await query(`
            CREATE TABLE IF NOT EXISTS produto_modificadores (
                produto_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
                categoria_id INTEGER REFERENCES modificador_categorias(id) ON DELETE CASCADE,
                PRIMARY KEY (produto_id, categoria_id)
            )
        `);
        console.log('✅ Tabela "produto_modificadores" (vinculo) verificada.');

        // 4. Atualizar tabela de produtos
        await query(`
            ALTER TABLE produtos 
            ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS cozinha_id INTEGER REFERENCES cozinhas(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS estoque_minimo INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS aviso_baixo_estoque BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS comportamento_estoque_vazio VARCHAR(30) DEFAULT 'marcar_indisponivel'
        `);
        console.log('✅ Colunas extras em "produtos" verificadas.');

        // 5. Migrar categorias existentes (se houver)
        const { rows: existingCats } = await query('SELECT DISTINCT categoria FROM produtos WHERE categoria IS NOT NULL');
        for (const cat of existingCats) {
            const catName = cat.categoria;
            // Verificar se já existe na nova tabela
            const { rows: check } = await query('SELECT id FROM categorias WHERE nome = $1', [catName]);
            let catId;
            if (check.length === 0) {
                const { rows: insert } = await query('INSERT INTO categorias (nome) VALUES ($1) RETURNING id', [catName]);
                catId = insert[0].id;
                console.log(`📂 Migrada categoria: ${catName}`);
            } else {
                catId = check[0].id;
            }
            // Atualizar produtos
            await query('UPDATE produtos SET categoria_id = $1 WHERE categoria = $2', [catId, catName]);
        }
        console.log('✅ Sincronização de categorias concluída.');

        console.log('🎉 Migração finalizada com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração:', err.message);
        process.exit(1);
    }
}

migrate();
