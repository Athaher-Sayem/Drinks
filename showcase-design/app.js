// Illustrative local menu, not TheCocktailDB results or real inventory.
const samples = [
  { name: 'Citrus Study', type: 'citrus', note: 'A visual concept with bright citrus cues.' },
  { name: 'Pink Hour', type: 'fruity', note: 'A fruit-forward moodboard, not a recipe.' },
  { name: 'Garden Glass', type: 'spirit-free', note: 'An alcohol-free concept in a garden palette.' },
  { name: 'Sunset Slice', type: 'citrus', note: 'An illustrative citrus-inspired tasting idea.' }
];
const selections = new Set();
let filter = 'all';
const list = document.getElementById('drinks');
const tray = document.getElementById('tray-items');
function render() {
  const query = document.getElementById('drink-search').value.trim().toLowerCase();
  const visible = samples.filter(item => (filter === 'all' || item.type === filter) && item.name.toLowerCase().includes(query));
  list.replaceChildren();
  visible.forEach(item => {
    const card = document.createElement('article'); card.className = 'drink';
    const art = document.createElement('div'); art.className = `drink-art ${item.type}`; art.setAttribute('aria-hidden', 'true');
    const head = document.createElement('div'); head.className = 'drink-header';
    const title = document.createElement('h3'); title.textContent = item.name;
    const type = document.createElement('span'); type.textContent = item.type.toUpperCase();
    head.append(title, type);
    const note = document.createElement('p'); note.textContent = item.note;
    const save = document.createElement('button'); save.type = 'button';
    save.textContent = selections.has(item.name) ? 'Saved to tray ✓' : 'Save to tasting tray +';
    save.setAttribute('aria-pressed', String(selections.has(item.name)));
    save.addEventListener('click', () => { if (selections.has(item.name)) selections.delete(item.name); else selections.add(item.name); render(); });
    card.append(art, head, note, save); list.append(card);
  });
  tray.replaceChildren();
  selections.forEach(name => { const item = document.createElement('li'); item.textContent = name; tray.append(item); });
  document.getElementById('tray-count').textContent = String(selections.size).padStart(2, '0');
  document.getElementById('no-results').hidden = visible.length > 0;
}
document.getElementById('drink-search').addEventListener('input', render);
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
  render();
}));
render();
