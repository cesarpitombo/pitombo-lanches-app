/**
 * db/seed_combo_example.js
 * Cria um exemplo real de Combo para demonstração
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function seed() {
  try {
    console.log('🌱 Criando exemplo de Combo...');

    // 1. Criar Categorias de Modificadores (Se não existirem)
    const { rows: catBatata } = await pool.query("INSERT INTO modificador_categorias (nome, min_escolhas, max_escolhas, obrigatorio) VALUES ('Escolha sua Batata', 1, 1, true) ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome RETURNING id");
    const { rows: catBebida } = await pool.query("INSERT INTO modificador_categorias (nome, min_escolhas, max_escolhas, obrigatorio) VALUES ('Escolha sua Bebida', 2, 2, true) ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome RETURNING id");

    const batataId = catBatata[0].id;
    const bebidaId = catBebida[0].id;

    // 2. Criar Itens para os grupos
    await pool.query("INSERT INTO modificador_itens (categoria_id, nome, preco, sku) VALUES ($1, 'Batata P', 0, 'BAT-P'), ($1, 'Batata M', 2.50, 'BAT-M'), ($1, 'Batata G', 5.00, 'BAT-G') ON CONFLICT DO NOTHING", [batataId]);
    await pool.query("INSERT INTO modificador_itens (categoria_id, nome, preco, sku) VALUES ($1, 'Coca-Cola 350ml', 0, 'COKE-350'), ($1, 'Guaraná 350ml', 0, 'GUA-350'), ($1, 'Suco Natural', 3.00, 'SUCO') ON CONFLICT DO NOTHING", [bebidaId]);

    // 3. Criar Produto Combo
    const { rows: prod } = await pool.query("INSERT INTO produtos (nome, descricao, preco, disponivel) VALUES ('Super Combo Casal (2 itens)', 'Combo com 1 batata e 2 bebidas', 45.90, true) RETURNING id");
    const comboId = prod[0].id;

    // 4. Associar Grupos ao Produto
    await pool.query("INSERT INTO produto_modificadores (produto_id, categoria_id, min_escolhas_override, max_escolhas_override, obrigatorio_override) VALUES ($1, $2, 1, 1, true), ($1, $3, 2, 2, true)", [comboId, batataId, bebidaId]);

    console.log('✅ Exemplo de Combo criado com ID:', comboId);
  } catch (err) {
    console.error('❌ Erro no seed:', err);
  } finally {
    await pool.end();
  }
}

seed();
