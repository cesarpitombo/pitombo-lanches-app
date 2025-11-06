const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// >>> usa a pasta "público" (com acento), que é a que está no repositório
app.use(express.static(path.join(__dirname, 'público')));

// rota principal abre o index da subpasta cliente
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'público', 'cliente', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
