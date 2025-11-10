document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("cardapio");

  try {
    const res = await fetch("/api/menu");
    const menu = await res.json();

    menu.forEach(item => {
      const card = document.createElement("div");
      card.innerHTML = `
        <h3>${item.nome}</h3>
        <p>R$ ${item.preco.toFixed(2)}</p>
        <img src="${item.imagem}" width="80">
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = "Erro ao carregar cardápio.";
  }
});
