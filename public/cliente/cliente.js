(async function () {
  const listEl = document.getElementById('list');
  const catsEl = document.getElementById('cats');
  const qEl = document.getElementById('q');

  // Carrega itens do JSON
  let items = [];
  try {
    const res = await fetch('/data/menu.json', { cache: 'no-store' });
    items = await res.json();
  } catch (e) {
    console.error('Erro ao carregar menu.json', e);
    items = [];
  }

  // Deriva categorias (em ordem)
  const cats = ['Todos', ...Array.from(new Set(items.map(i => i.categoria || 'Outros')))];

  let state = {
    cat: 'Todos',
    q: ''
  };

  // Render categorias
  function renderCats() {
    catsEl.innerHTML = '';
    cats.forEach(c => {
      const b = document.createElement('button');
      b.className = 'chip' + (state.cat === c ? ' active' : '');
      b.textContent = c;
      b.onclick = () => { state.cat = c; render(); };
      catsEl.appendChild(b);
    });
  }

  // Render cards
  function render() {
    const term = (state.q || '').toLowerCase().trim();
    let filtered = items.slice();

    if (state.cat !== 'Todos') {
      filtered = filtered.filter(i => (i.categoria || '') === state.cat);
    }
    if (term) {
      filtered = filtered.filter(i =>
        (i.nome || '').toLowerCase().includes(term) ||
        String(i.preco).includes(term)
      );
    }

    listEl.innerHTML = '';
    filtered.forEach(i => {
      const card = document.createElement('div');
      card.className = 'card';

      const img = document.createElement('div');
      img.className = 'img';
      img.textContent = i.imagem ? '' : 'sem imagem';
      if (i.imagem) {
        const tag = document.createElement('img');
        tag.src = i.imagem;
        tag.alt = i.nome;
        tag.style.maxWidth = '100%';
        tag.style.maxHeight = '100%';
        tag.style.objectFit = 'contain';
        img.appendChild(tag);
      }
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = i.nome;

      const price = document.createElement('div');
      price.className = 'price';
      price.textContent = `R$ ${Number(i.preco).toFixed(2)}`;

      card.appendChild(img);
      card.appendChild(name);
      card.appendChild(price);
      listEl.appendChild(card);
    });
  }

  // Eventos
  qEl.addEventListener('input', (e) => {
    state.q = e.target.value;
    render();
  });

  renderCats();
  render();
})();
