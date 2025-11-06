
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🚀 Servidor Pitombo Lanches está rodando com sucesso!');
});

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando em http://localhost:${PORT}`);
});
