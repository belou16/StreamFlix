/**
 * Point d'entrée commun aux trois pages.
 * L'attribut data-page du <body> indique quelle page initialiser.
 */
import { ApiError, getShowById, getShows, sendSelection } from './api.js';
import {
  addToWatchlist,
  cloneTemplate,
  compareNullable,
  createElement,
  debounce,
  formatCount,
  formatNetwork,
  formatRating,
  formatStars,
  formatStatus,
  formatYear,
  getPosterUrl,
  getRating,
  getTodayDate,
  getWatchlist,
  getYear,
  htmlToParagraphs,
  isInWatchlist,
  isValidPriority,
  MAX_PRIORITY,
  MIN_PRIORITY,
  normalizeText,
  removeFromWatchlist,
  updatePriority,
} from './utils.js';

const SEARCH_DEBOUNCE_MS = 300;
const PLACEHOLDER_POSTER = 'assets/images/poster-placeholder.svg';

// Dimensions des affiches « medium » de TVMaze : elles réservent la place de l'image avant son chargement.
const POSTER_WIDTH = 210;
const POSTER_HEIGHT = 295;

// Entier strictement positif, sans zéro initial.
const SHOW_ID_PATTERN = /^[1-9]\d*$/;

// En attendant les comptes utilisateurs de l'API de production.
const USER_ID = 1;

const PRIORITY_ERROR = `La priorité doit être un nombre entier entre ${MIN_PRIORITY} et ${MAX_PRIORITY}.`;

// Chaque option du tri associe une donnée à comparer et un sens (1 croissant, -1 décroissant).
const SORT_OPTIONS = {
  'rating-desc': { getValue: getRating, direction: -1 },
  'rating-asc': { getValue: getRating, direction: 1 },
  'year-desc': { getValue: getYear, direction: -1 },
  'year-asc': { getValue: getYear, direction: 1 },
};

// Composants partagés

/**
 * Affiche un état de l'interface (loading, empty, error ou not-found)
 * à la place du contenu d'une zone alimentée par le réseau.
 */
function renderState(container, { type, title, message = '', action = null, headingLevel = 2 }) {
  const state = createElement('div', `state state-${type}`);
  const icon = createElement('span', type === 'loading' ? 'spinner' : 'state-icon');
  icon.setAttribute('aria-hidden', 'true');

  state.append(icon, createElement(`h${headingLevel}`, 'state-title', title));

  if (message) state.append(createElement('p', 'state-message', message));
  if (action) state.append(action);

  container.replaceChildren(state);
}

function createButton(label, onClick) {
  const button = createElement('button', 'button button-secondary', label);
  button.type = 'button';
  button.addEventListener('click', onClick);

  return button;
}

function createLinkButton(label, href) {
  const link = createElement('a', 'button button-secondary', label);
  link.href = href;

  return link;
}

function createPoster(name, imageUrl, loading = 'lazy') {
  const poster = createElement('img', 'poster');
  poster.width = POSTER_WIDTH;
  poster.height = POSTER_HEIGHT;
  poster.loading = loading;
  poster.decoding = 'async';

  // Affiche introuvable : on passe à l'affiche par défaut. `once` évite une boucle si elle échouait aussi.
  poster.addEventListener('error', () => showPlaceholder(poster), { once: true });

  if (imageUrl) {
    poster.src = imageUrl;
    poster.alt = `Affiche de ${name}`;
  } else {
    showPlaceholder(poster);
  }

  return poster;
}

function showPlaceholder(poster) {
  poster.src = PLACEHOLDER_POSTER;
  poster.alt = 'Affiche indisponible';
}

function fillRating(element, rating) {
  if (rating === null) {
    element.textContent = 'Non notée';
    element.classList.add('rating-missing');
    return;
  }

  const formattedRating = formatRating(rating);

  // Les étoiles sont visuelles : l'équivalent textuel est porté par aria-label.
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', `Note : ${formattedRating} sur 10`);
  element.replaceChildren(
    createElement('span', 'rating-stars', formatStars(rating)),
    createElement('span', 'rating-value', `${formattedRating} / 10`),
  );
}

function fillGenreList(list, genres) {
  if (genres.length === 0) {
    list.replaceWith(createElement('p', 'text-muted', 'Genre non renseigné'));
    return;
  }

  list.replaceChildren(...genres.map((genre) => createElement('li', 'tag', genre)));
}

function showFeedback(element, type, message) {
  element.dataset.type = type;
  element.textContent = message;
}

function getShowUrl(showId) {
  return `serie.html?id=${showId}`;
}

function getErrorMessage(error) {
  return error instanceof ApiError ? error.message : 'Une erreur inattendue est survenue.';
}

// En-tête : menu mobile et compteur de Ma liste

function initHeader() {
  initMenuToggle();
  updateWatchlistCount();

  // Le compteur reste juste si la liste change dans un autre onglet ou après un retour arrière.
  window.addEventListener('storage', updateWatchlistCount);
  window.addEventListener('pageshow', updateWatchlistCount);
}

function initMenuToggle() {
  const toggle = document.querySelector('.menu-toggle');

  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || toggle.getAttribute('aria-expanded') !== 'true') return;

    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  });
}

function updateWatchlistCount() {
  const count = getWatchlist().length;

  document.querySelectorAll('[data-watchlist-count]').forEach((counter) => {
    counter.textContent = count;
  });
}

// Catalogue (index.html)

let catalogPage = null;

function initCatalogPage() {
  catalogPage = {
    shows: [],
    form: document.querySelector('#catalog-filters'),
    searchInput: document.querySelector('#search-input'),
    genreSelect: document.querySelector('#genre-select'),
    sortSelect: document.querySelector('#sort-select'),
    count: document.querySelector('#results-count'),
    status: document.querySelector('#catalog-status'),
    grid: document.querySelector('#catalog-grid'),
  };

  catalogPage.searchInput.addEventListener('input', debounce(renderCatalog, SEARCH_DEBOUNCE_MS));
  catalogPage.genreSelect.addEventListener('change', renderCatalog);
  catalogPage.sortSelect.addEventListener('change', renderCatalog);
  catalogPage.form.addEventListener('submit', (event) => event.preventDefault());

  loadCatalog();
}

async function loadCatalog() {
  setFiltersDisabled(true);
  renderState(catalogPage.status, { type: 'loading', title: 'Chargement des séries…' });

  try {
    catalogPage.shows = await getShows();
  } catch (error) {
    renderState(catalogPage.status, {
      type: 'error',
      title: 'Le catalogue est indisponible pour le moment.',
      message: getErrorMessage(error),
      action: createButton('Réessayer', loadCatalog),
    });
    return;
  }

  fillGenreOptions(catalogPage.shows);
  setFiltersDisabled(false);
  renderCatalog();
}

function setFiltersDisabled(isDisabled) {
  for (const field of catalogPage.form.elements) {
    field.disabled = isDisabled;
  }
}

// Les genres proposés sont déduits des séries reçues : aucun n'est écrit en dur dans le HTML.
function fillGenreOptions(shows) {
  const genres = [...new Set(shows.flatMap((show) => show.genres))];

  genres
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .forEach((genre) => catalogPage.genreSelect.add(new Option(genre, genre)));
}

function renderCatalog() {
  const filters = readFilters();
  const visibleShows = sortShows(filterShows(catalogPage.shows, filters), filters.sort);

  catalogPage.count.textContent = formatCount(visibleShows.length, 'série affichée', 'séries affichées');

  if (visibleShows.length === 0) {
    catalogPage.grid.replaceChildren();
    renderEmptyCatalog(filters.query);
    return;
  }

  catalogPage.status.replaceChildren();
  catalogPage.grid.replaceChildren(...visibleShows.map(createShowCard));
}

function readFilters() {
  const query = catalogPage.searchInput.value.trim();

  return {
    // En dessous de la longueur minimale du champ (attribut minlength), la recherche est ignorée.
    query: query.length >= catalogPage.searchInput.minLength ? query : '',
    genre: catalogPage.genreSelect.value,
    sort: catalogPage.sortSelect.value,
  };
}

function filterShows(shows, { query, genre }) {
  const searchedText = normalizeText(query);

  return shows.filter((show) => {
    const matchesTitle = normalizeText(show.name).includes(searchedText);
    const matchesGenre = genre === '' || show.genres.includes(genre);

    return matchesTitle && matchesGenre;
  });
}

function sortShows(shows, sortKey) {
  const { getValue, direction } = SORT_OPTIONS[sortKey];

  return [...shows].sort((a, b) => compareNullable(getValue(a), getValue(b), direction));
}

function renderEmptyCatalog(query) {
  if (catalogPage.shows.length === 0) {
    renderState(catalogPage.status, {
      type: 'empty',
      title: 'Le catalogue ne contient aucune série pour le moment.',
      message: 'Revenez un peu plus tard.',
      action: createButton('Réessayer', loadCatalog),
    });
    return;
  }

  renderState(catalogPage.status, {
    type: 'empty',
    title: query ? `Aucune série ne correspond à « ${query} ».` : 'Aucune série ne correspond à ces filtres.',
    message: 'Essayez un autre titre ou retirez le filtre de genre.',
    action: createButton('Réinitialiser les filtres', resetFilters),
  });
}

function resetFilters() {
  catalogPage.form.reset();
  renderCatalog();
  catalogPage.searchInput.focus();
}

function createShowCard(show) {
  const card = cloneTemplate('#show-card-template');
  const link = card.querySelector('.show-card-link');

  link.href = getShowUrl(show.id);
  link.textContent = show.name;

  card.querySelector('.show-card-media').append(createPoster(show.name, getPosterUrl(show)));
  card.querySelector('.show-card-year').textContent = formatYear(getYear(show));
  fillRating(card.querySelector('.show-card-rating'), getRating(show));
  fillGenreList(card.querySelector('.show-card-genres'), show.genres);

  return card;
}

// Fiche série (serie.html)

let showPage = null;

function initShowPage() {
  showPage = {
    status: document.querySelector('#show-status'),
    detail: document.querySelector('#show-detail'),
    poster: document.querySelector('#show-poster'),
    title: document.querySelector('#show-title'),
    rating: document.querySelector('#show-rating'),
    year: document.querySelector('#show-year'),
    network: document.querySelector('#show-network'),
    airingStatus: document.querySelector('#show-airing-status'),
    genres: document.querySelector('#show-genres'),
    summary: document.querySelector('#show-summary'),
    watchlistButton: document.querySelector('#watchlist-button'),
    watchlistFeedback: document.querySelector('#watchlist-feedback'),
  };

  const id = new URLSearchParams(window.location.search).get('id');

  if (!id) {
    renderShowNotFound("Aucun identifiant de série n'est indiqué dans l'adresse.");
  } else if (!SHOW_ID_PATTERN.test(id)) {
    renderShowNotFound(`L'identifiant « ${id} » n'est pas valide : il doit s'agir d'un nombre entier.`);
  } else {
    loadShow(Number(id));
  }
}

async function loadShow(id) {
  renderState(showPage.status, { type: 'loading', title: 'Chargement de la fiche…', headingLevel: 1 });

  let show;

  try {
    show = await getShowById(id);
  } catch (error) {
    renderShowError(error, id);
    return;
  }

  showPage.status.replaceChildren();
  renderShow(show);
}

function renderShowError(error, id) {
  // Un identifiant bien formé mais inconnu de l'API donne une réponse 404.
  if (error instanceof ApiError && error.status === 404) {
    renderShowNotFound(`Aucune série ne correspond à l'identifiant ${id}.`);
    return;
  }

  renderState(showPage.status, {
    type: 'error',
    title: 'Impossible de charger cette fiche.',
    message: getErrorMessage(error),
    action: createButton('Réessayer', () => loadShow(id)),
    headingLevel: 1,
  });
}

function renderShowNotFound(message) {
  document.title = 'Fiche introuvable · StreamFlix';

  renderState(showPage.status, {
    type: 'not-found',
    title: 'Fiche introuvable',
    message,
    action: createLinkButton('Retour au catalogue', 'index.html'),
    headingLevel: 1,
  });
}

function renderShow(show) {
  document.title = `${show.name} · StreamFlix`;

  showPage.poster.append(createPoster(show.name, getPosterUrl(show, 'original'), 'eager'));
  showPage.title.textContent = show.name;
  showPage.year.textContent = formatYear(getYear(show));
  showPage.network.textContent = formatNetwork(show);
  showPage.airingStatus.textContent = formatStatus(show.status);
  showPage.summary.replaceChildren(...createSummary(show.summary));
  fillRating(showPage.rating, getRating(show));
  fillGenreList(showPage.genres, show.genres);

  updateWatchlistButton(show.id);
  showPage.watchlistButton.addEventListener('click', () => toggleWatchlist(show));

  showPage.detail.hidden = false;
}

function createSummary(summaryHtml) {
  const paragraphs = summaryHtml ? htmlToParagraphs(summaryHtml) : [];

  if (paragraphs.length === 0) {
    return [createElement('p', 'text-muted', 'Aucun résumé disponible pour cette série.')];
  }

  return paragraphs.map((text) => createElement('p', '', text));
}

function toggleWatchlist(show) {
  if (isInWatchlist(show.id)) {
    removeFromWatchlist(show.id);
    showFeedback(showPage.watchlistFeedback, 'success', 'Série retirée de votre liste.');
  } else {
    addToWatchlist(show);
    showFeedback(showPage.watchlistFeedback, 'success', 'Série ajoutée à votre liste.');
  }

  updateWatchlistButton(show.id);
  updateWatchlistCount();
}

function updateWatchlistButton(showId) {
  const button = showPage.watchlistButton;
  const isSaved = isInWatchlist(showId);

  button.textContent = isSaved ? 'Retirer de ma liste' : 'Ajouter à ma liste';
  button.classList.toggle('button-primary', !isSaved);
  button.classList.toggle('button-secondary', isSaved);
}

// Ma liste (liste.html)

let watchlistPage = null;

function initWatchlistPage() {
  watchlistPage = {
    title: document.querySelector('#watchlist-title'),
    count: document.querySelector('#watchlist-count'),
    status: document.querySelector('#watchlist-status'),
    form: document.querySelector('#watchlist-form'),
    items: document.querySelector('#watchlist-items'),
    submitButton: document.querySelector('#submit-button'),
    feedback: document.querySelector('#submit-feedback'),
  };

  watchlistPage.items.addEventListener('input', handlePriorityInput);
  watchlistPage.items.addEventListener('click', handleRemoveClick);
  watchlistPage.form.addEventListener('submit', handleSelectionSubmit);

  renderWatchlist();
}

function renderWatchlist() {
  const list = getWatchlist();

  watchlistPage.count.textContent = formatCount(list.length, 'série retenue', 'séries retenues');

  if (list.length === 0) {
    watchlistPage.form.hidden = true;
    renderState(watchlistPage.status, {
      type: 'empty',
      title: 'Votre liste est vide.',
      message: "Ouvrez la fiche d'une série depuis le catalogue pour l'ajouter à votre liste.",
      action: createLinkButton('Parcourir le catalogue', 'index.html'),
    });
    return;
  }

  watchlistPage.status.replaceChildren();
  watchlistPage.items.replaceChildren(...list.map(createWatchlistItem));
  watchlistPage.form.hidden = false;
}

function createWatchlistItem(item) {
  const row = cloneTemplate('#watchlist-item-template');
  const link = row.querySelector('.watchlist-link');

  link.href = getShowUrl(item.id);
  link.textContent = item.name;

  row.querySelector('.watchlist-media').append(createPoster(item.name, item.image));
  row.querySelector('.watchlist-year').textContent = formatYear(item.year);
  row.querySelector('.remove-button').dataset.id = item.id;
  row.querySelector('.remove-button-context').textContent = ` ${item.name}`;
  fillPriorityField(row, item);

  return row;
}

// Relie le libellé, le champ et son message d'erreur grâce à des identifiants propres à la série.
function fillPriorityField(row, item) {
  const fieldId = `priority-${item.id}`;
  const errorId = `${fieldId}-error`;
  const input = row.querySelector('.priority-input');

  input.id = fieldId;
  input.value = item.priority;
  input.dataset.id = item.id;
  input.setAttribute('aria-describedby', errorId);

  row.querySelector('.priority-label').htmlFor = fieldId;
  row.querySelector('.field-error').id = errorId;
}

function handlePriorityInput(event) {
  const input = event.target;
  if (!input.matches('.priority-input')) return;

  if (validatePriorityField(input)) {
    updatePriority(Number(input.dataset.id), Number(input.value));
  }
}

// Affiche ou efface le message d'erreur du champ, puis indique s'il est valide.
function validatePriorityField(input) {
  const isValid = isValidPriority(input.value);
  const error = input.closest('.watchlist-item').querySelector('.field-error');

  input.setAttribute('aria-invalid', String(!isValid));
  error.textContent = isValid ? '' : PRIORITY_ERROR;

  return isValid;
}

function handleRemoveClick(event) {
  const button = event.target.closest('.remove-button');
  if (!button) return;

  removeFromWatchlist(Number(button.dataset.id));
  updateWatchlistCount();
  renderWatchlist();

  // La ligne supprimée avait le focus : on le replace sur le titre de la page.
  watchlistPage.title.focus();
}

async function handleSelectionSubmit(event) {
  event.preventDefault();

  // Tous les champs sont vérifiés, pour signaler chaque priorité fautive et pas seulement la première.
  const inputs = [...watchlistPage.items.querySelectorAll('.priority-input')];
  const invalidInputs = inputs.filter((input) => !validatePriorityField(input));

  if (invalidInputs.length > 0) {
    showFeedback(watchlistPage.feedback, 'error', "Corrigez les priorités signalées avant d'envoyer votre sélection.");
    invalidInputs[0].focus();
    return;
  }

  setSubmitting(true);
  showFeedback(watchlistPage.feedback, 'pending', 'Envoi de votre sélection…');

  try {
    const response = await sendSelection(buildSelectionPayload());
    showFeedback(watchlistPage.feedback, 'success', `Sélection envoyée (n° ${response.id}).`);
  } catch (error) {
    showFeedback(watchlistPage.feedback, 'error', `L'envoi a échoué. ${getErrorMessage(error)}`);
  } finally {
    setSubmitting(false);
  }
}

function buildSelectionPayload() {
  const shows = getWatchlist()
    .map((item) => ({ showId: item.id, priority: item.priority }))
    .sort((a, b) => a.priority - b.priority);

  return { userId: USER_ID, date: getTodayDate(), shows };
}

function setSubmitting(isSubmitting) {
  const button = watchlistPage.submitButton;

  button.disabled = isSubmitting;
  button.classList.toggle('is-loading', isSubmitting);
  button.textContent = isSubmitting ? 'Envoi en cours…' : 'Envoyer ma sélection';
}

// Démarrage

const PAGE_INITIALIZERS = {
  catalog: initCatalogPage,
  show: initShowPage,
  watchlist: initWatchlistPage,
};

initHeader();
PAGE_INITIALIZERS[document.body.dataset.page]();
