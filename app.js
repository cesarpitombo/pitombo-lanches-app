const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// rota home -> página inicial do cliente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

// API do cardápio -> lê data/menu.json
app.get('/cardapio', (req, res) => {
  try {
    const menuPath = path.join(__dirname, 'data', 'menu.json');
    const raw = fs.readFileSync(menuPath, 'utf8');
    const json = JSON.parse(raw);
    res.json(json);
  } catch (err) {
    console.error('Erro ao ler menu.json:', err);
    res.status(500).json({ error: 'Erro ao carregar o cardápio' });
  }
});

// Receber pedido do carrinho
app.post('/pedido', (req, res) => {
  try {
    const { cliente = 'Cliente', itens = [] } = req.body;

    // carrega preços do menu para calcular total
    const menuPath = path.join(__dirname, 'data', 'menu.json');
    const catalogo = JSON.parse(fs.readFileSync(menuPath, 'utf8'));

    const mapaPreco = new Map(catalogo.map(p => [p.id, Number(p.preco)]));
    const total = (itens || []).reduce((acc, i) => {
      const preco = mapaPreco.get(i.produto_id) || 0;
      const qty = Number(i.quantidade || 1);
      return acc + preco * qty;
    }, 0);

    const pedidoId = Date.now();

    // log simples (pode trocar por DB depois)
    console.log('Novo pedido recebido:', {
      pedidoId, cliente, itens, total
    });

    // resposta
    return res.json({ ok: true, pedidoId, total });
  } catch (err) {
    console.error('Erro ao processar pedido:', err);
    res.status(500).json({ error: 'Erro ao processar pedido' });
  }
});

// páginas explícitas (opcional, ajuda em links diretos)
app.get('/cliente/cardapio.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'cardapio.html'));
});
app.get('/cliente/carrinho.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'carrinho.html'));
});
app.get('/pedido-confirmado', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'pedido-confirmado.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
