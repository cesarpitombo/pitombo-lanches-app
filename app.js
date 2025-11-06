const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// usar pasta public
app.use(express.static(path.join(__dirname, 'public')));

// rota principal abre o cliente/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cliente', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Pitombo Lanches rodando na porta ${PORT}`);
});
