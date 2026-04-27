-- ═══════════════════════════════════════════════════════════
-- Pitombo Lanches — Schema SQL
-- Executar com: psql -U postgres -d pitombo_lanches -f db/schema.sql
-- ═══════════════════════════════════════════════════════════

-- ─── Tipos customizados ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE status_pedido AS ENUM (
    'recebido',
    'em_preparo',
    'pronto',
    'em_entrega',
    'entregue'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── Tabela: produtos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produtos (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  preco       NUMERIC(10, 2) NOT NULL CHECK (preco >= 0),
  categoria   VARCHAR(60)  NOT NULL DEFAULT 'Lanches',
  imagem_url  TEXT,
  disponivel  BOOLEAN      NOT NULL DEFAULT TRUE,
  controlar_estoque BOOLEAN DEFAULT FALSE,
  estoque_atual INTEGER    DEFAULT 0 CHECK (estoque_atual >= 0),
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Tabela: entregadores ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entregadores (
  id        SERIAL PRIMARY KEY,
  nome      VARCHAR(100) NOT NULL,
  telefone  VARCHAR(20),
  ativo     BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Tabela: pedidos ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
  id              SERIAL PRIMARY KEY,
  cliente         VARCHAR(100) NOT NULL,
  telefone        VARCHAR(20),
  observacoes     TEXT,
  status          status_pedido NOT NULL DEFAULT 'recebido',
  total           NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
  -- entregador_id referencia equipe(id) (funcao='Entregador'). FK adicionado em runtime
  -- para evitar dependência circular com a tabela equipe (criada no boot via routes/equipe.js).
  entregador_id   INTEGER,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tabela: itens_pedido ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS itens_pedido (
  id               SERIAL PRIMARY KEY,
  pedido_id        INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id       INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
  nome_produto     VARCHAR(100) NOT NULL,  -- snapshot name at order time
  quantidade       INTEGER      NOT NULL CHECK (quantidade > 0),
  preco_unitario   NUMERIC(10, 2) NOT NULL CHECK (preco_unitario >= 0)
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pedidos_status     ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado_em  ON pedidos(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_itens_pedido_id    ON itens_pedido(pedido_id);

-- ─── Trigger: atualiza "atualizado_em" automaticamente ───────────────────────
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_atualizado_em ON pedidos;
CREATE TRIGGER trg_pedidos_atualizado_em
  BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- ─── Tabela: store_settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_settings (
  id                      SERIAL PRIMARY KEY,
  store_name             VARCHAR(100) NOT NULL DEFAULT 'Pitombo Lanches',
  store_subtitle         TEXT DEFAULT 'O Melhor Hamburguer da Região',
  logo_url               TEXT,
  favicon_url            TEXT,
  color_primary          VARCHAR(20) DEFAULT '#e8420a',
  color_secondary        VARCHAR(20) DEFAULT '#1c1e21',
  color_accent           VARCHAR(20) DEFAULT '#ff9800',
  color_button_main      VARCHAR(20) DEFAULT '#e8420a',
  color_panel_bg         VARCHAR(20) DEFAULT '#f8f9fa',
  color_card_bg          VARCHAR(20) DEFAULT '#ffffff',
  color_text             VARCHAR(20) DEFAULT '#111111',
  color_status_recebido  VARCHAR(20) DEFAULT '#333333',
  color_status_preparo   VARCHAR(20) DEFAULT '#ff9800',
  color_status_pronto    VARCHAR(20) DEFAULT '#e8420a',
  color_status_entrega   VARCHAR(20) DEFAULT '#4caf50',
  color_status_entregue  VARCHAR(20) DEFAULT '#999999',
  color_status_cancelado VARCHAR(20) DEFAULT '#dc3545',
  color_status_atrasado  VARCHAR(20) DEFAULT '#dc3545',
  contact_phone          VARCHAR(20),
  contact_whatsapp       VARCHAR(20),
  store_address          TEXT,
  footer_text            TEXT DEFAULT '© 2026 Pitombo Lanches - Todos os direitos reservados.',
  admin_display_name     VARCHAR(100) DEFAULT 'PITOMBO ADMIN',
  public_display_name    VARCHAR(100) DEFAULT 'Pitombo Lanches',
  domain                 VARCHAR(100) DEFAULT 'pitombo.lanches',
  social_instagram       VARCHAR(255),
  social_facebook        VARCHAR(255),
  store_banner_url       TEXT,
  operating_hours        VARCHAR(255) DEFAULT 'Seg a Sáb, das 18h às 23h',
  atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dados iniciais: store_settings
INSERT INTO store_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ─── Trigger para store_settings ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_settings_atualizado_em ON store_settings;
CREATE TRIGGER trg_settings_atualizado_em
  BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- ─── Dados iniciais: produtos ─────────────────────────────────────────────────
INSERT INTO produtos (nome, descricao, preco, categoria) VALUES
  ('X-Burger',      'Hambúrguer artesanal com queijo, alface e tomate',            20.00, 'Lanches'),
  ('X-Bacon',       'Hambúrguer com bacon crocante, queijo e molho especial',       25.00, 'Lanches'),
  ('X-Tudo',        'Hambúrguer completo com ovo, bacon, queijo, alface e tomate',  30.00, 'Lanches'),
  ('X-Frango',      'Frango grelhado com queijo e salada',                          22.00, 'Lanches'),
  ('Batata Frita',  'Porção de batata frita crocante com sal',                      12.00, 'Acompanhamentos'),
  ('Onion Rings',   'Anéis de cebola empanados e fritos',                           14.00, 'Acompanhamentos'),
  ('Refrigerante',  'Coca-Cola, Guaraná ou Sprite (350ml)',                          7.00, 'Bebidas'),
  ('Suco Natural',  'Suco de laranja, limão ou maracujá (400ml)',                    9.00, 'Bebidas'),
  ('Milk Shake',    'Chocolate, morango ou baunilha (500ml)',                        16.00, 'Bebidas')
ON CONFLICT DO NOTHING;

-- ─── Dados iniciais: entregadores ────────────────────────────────────────────
INSERT INTO entregadores (nome, telefone) VALUES
  ('Carlos Silva',  '(11) 91234-5678'),
  ('Ana Souza',     '(11) 99876-5432')
ON CONFLICT DO NOTHING;

-- ─── Tabela: zonas_entrega ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zonas_entrega (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT,
  taxa        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (taxa >= 0),
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Colunas extras na tabela pedidos (adicionadas progressivamente) ──────────
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS endereco        TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_status  VARCHAR(20) DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS payment_method  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS troco_para      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS valor_troco     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS tipo            VARCHAR(20) DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS taxa_entrega    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS zona_id         INTEGER REFERENCES zonas_entrega(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zona_nome       VARCHAR(100);

