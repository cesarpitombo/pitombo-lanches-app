const { query } = require('./connection');

async function fix() {
  try {
    console.log('🚀 Iniciando Correção Crítica do Banco de Dados...');

    // 1. Garantir colunas em modificador_categorias
    console.log('- Ajustando modificador_categorias...');
    await query(`
      ALTER TABLE modificador_categorias 
      ADD COLUMN IF NOT EXISTS min_escolhas INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS max_escolhas INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS selecao_unica BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
    `);

    // 2. Garantir colunas em modificador_itens
    console.log('- Ajustando modificador_itens...');
    await query(`
      ALTER TABLE modificador_itens 
      ADD COLUMN IF NOT EXISTS sku VARCHAR(50),
      ADD COLUMN IF NOT EXISTS custo DECIMAL(10,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS quantidade_maxima INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;
    `);

    // 3. CORREÇÃO CRÍTICA: produto_modificadores
    console.log('- Ajustando produto_modificadores (Join Table)...');
    
    // Adicionar ID se não existir
    await query(`ALTER TABLE produto_modificadores ADD COLUMN IF NOT EXISTS id SERIAL PRIMARY KEY`).catch(() => {});

    // Adicionar todos os overrides solicitados
    const overrides = [
      ['min_escolhas_override', 'INTEGER'],
      ['max_escolhas_override', 'INTEGER'],
      ['obrigatorio_override', 'BOOLEAN'],
      ['selecao_unica_override', 'BOOLEAN'],
      ['ordem_override', 'INTEGER'],
      ['ativo_override', 'BOOLEAN']
    ];

    for (const [col, type] of overrides) {
      console.log(`  + Verificando coluna: ${col}`);
      await query(`ALTER TABLE produto_modificadores ADD COLUMN IF NOT EXISTS ${col} ${type}`);
    }

    console.log('✅ Banco de dados sincronizado com sucesso!');
  } catch (err) {
    console.error('❌ Erro crítico na migração:', err);
  } finally {
    process.exit();
  }
}

fix();
