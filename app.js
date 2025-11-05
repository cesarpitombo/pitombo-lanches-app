const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Rota principal
app.get('/', (req, res) => {
  res.send('🚀 Servidor Pitombo Lanches rodando com sucesso no Render!');
});

// Inicia o servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor Pitombo Lanches ativo na porta ${PORT}`);
});
