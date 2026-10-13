// Script commun aux 3 pages. L'attribut data-page du <body> indique la page à lancer.
import { ApiError, getShowById, getShows, sendSelection } from './api.js';
import {
  addToWatchlist,
  cloneTemplate,
  compareNullable,
  createButton,
  createElement,
  createLinkButton,
  createPoster,
  debounce,
  fillGenreList,
  fillRating,
  formatCount,
  formatNetwork,
  formatStatus,
  formatYear,
  getErrorMessage,
  getPosterUrl,
  getRating,
  getShowUrl,
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
  renderState,
  showFeedback,
  updatePriority,
} from './utils.js';

const SEARCH_DEBOUNCE_MS = 300;
const EAGER_POSTER_COUNT = 6; // affiches visibles à l'ouverture : chargées tout de suite
const CARDS_PER_BATCH = 24; // cartes ajoutées par tâche, pour ne pas bloquer la page
const SHOW_ID_PATTERN = /^[1-9]\d*$/; // nombre entier positif
const USER_ID = 1; // pas encore de comptes utilisateurs
const PRIORITY_ERROR = `La priorité doit être un nombre entier entre ${MIN_PRIORITY} et ${MAX_PRIORITY}.`;

// Pour chaque tri : la valeur à comparer et le sens (1 croissant, -1 décroissant).
const SORT_OPTIONS = {
  'rating-desc': { getValue: getRating, direction: -1 },
  'rating-asc': { getValue: getRating, direction: 1 },
  'year-desc': { getValue: getYear, direction: -1 },
  'year-asc': { getValue: getYear, direction: 1 },
};

// En-tête : menu mobile et compteur de Ma liste

function initHeader() {
  const toggle = document.querySelector('.menu-toggle');
  const isMenuOpen = () => toggle.getAttribute('aria-expanded') === 'true';

  toggle.addEventListener('click', () => toggle.setAttribute('aria-expanded', String(!isMenuOpen())));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isMenuOpen()) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });

  // Met à jour le compteur si la liste change ailleurs (autre onglet, retour arrière).
  updateWatchlistCount();
  window.addEventListener('storage', updateWatchlistCount);
  window.addEventListener('pageshow', updateWatchlistCount);
}

function updateWatchlistCount() {
  const count = getWatchlist().length;
  for (const counter of document.querySelectorAll('[data-watchlist-count]')) counter.textContent = count;
}

// Catalogue (index.html)

let catalogPage = null;

function initCatalogPage() {
  catalogPage = {
    shows: [],
    renderId: 0,
    form: document.querySelector('#catalog-filters'),
    count: document.querySelector('#results-count'),
    status: document.querySelector('#catalog-status'),
    grid: document.querySelector('#catalog-grid'),
  };

  const { query, genre, sort } = catalogPage.form.elements;
  query.addEventListener('input', debounce(renderCatalog, SEARCH_DEBOUNCE_MS));
  genre.addEventListener('change', renderCatalog);
  sort.addEventListener('change', renderCatalog);
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

  fillGenreOptions();
  setFiltersDisabled(false);
  renderCatalog();
}

function setFiltersDisabled(isDisabled) {
  for (const field of catalogPage.form.elements) field.disabled = isDisabled;
}

// Genres tirés des données reçues : rien en dur dans le HTML.
function fillGenreOptions() {
  const genres = new Set(catalogPage.shows.flatMap((show) => show.genres));
  const sortedGenres = [...genres].sort((a, b) => a.localeCompare(b, 'fr'));

  sortedGenres.forEach((genre) => catalogPage.form.elements.genre.add(new Option(genre, genre)));
}

function renderCatalog() {
  const shows = getVisibleShows();
  const renderId = ++catalogPage.renderId; // un nouveau rendu annule les paquets encore en attente

  catalogPage.count.textContent = formatCount(shows.length, 'série affichée', 'séries affichées');
  catalogPage.grid.replaceChildren();

  if (shows.length === 0) {
    renderEmptyCatalog();
    return;
  }

  catalogPage.status.replaceChildren();
  appendCards(shows, 0, renderId);
}

// Ajoute les cartes par paquets, chacun dans sa propre tâche, pour garder la page réactive.
function appendCards(shows, start, renderId) {
  if (renderId !== catalogPage.renderId) return;

  const batch = shows.slice(start, start + CARDS_PER_BATCH);
  catalogPage.grid.append(
    ...batch.map((show, index) => createShowCard(show, start + index < EAGER_POSTER_COUNT ? 'eager' : 'lazy')),
  );

  if (start + CARDS_PER_BATCH < shows.length) {
    setTimeout(() => appendCards(shows, start + CARDS_PER_BATCH, renderId));
  }
}

function getVisibleShows() {
  const { genre, sort } = catalogPage.form.elements;
  const searchedText = normalizeText(getSearchQuery());
  const { getValue, direction } = SORT_OPTIONS[sort.value];

  return catalogPage.shows
    .filter((show) => normalizeText(show.name).includes(searchedText))
    .filter((show) => genre.value === '' || show.genres.includes(genre.value))
    .sort((a, b) => compareNullable(getValue(a), getValue(b), direction));
}

// Texte plus court que minlength : pas de recherche.
function getSearchQuery() {
  const input = catalogPage.form.elements.query;
  const query = input.value.trim();
  return query.length >= input.minLength ? query : '';
}

function renderEmptyCatalog() {
  if (catalogPage.shows.length === 0) {
    renderState(catalogPage.status, {
      type: 'empty',
      title: 'Le catalogue ne contient aucune série pour le moment.',
      action: createButton('Réessayer', loadCatalog),
    });
    return;
  }

  const query = getSearchQuery();
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
  catalogPage.form.elements.query.focus();
}

function createShowCard(show, posterLoading) {
  const card = cloneTemplate('#show-card-template');
  const link = card.querySelector('.show-card-link');

  link.href = getShowUrl(show.id);
  link.textContent = show.name;
  card.querySelector('.show-card-media').append(createPoster(show.name, getPosterUrl(show), posterLoading));
  card.querySelector('.show-card-year').textContent = formatYear(getYear(show));
  fillRating(card.querySelector('.show-card-rating'), getRating(show));
  fillGenreList(card.querySelector('.show-card-genres'), show.genres);

  return card;
}

// Fiche série (serie.html)

function initShowPage() {
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
  renderShowState({ type: 'loading', title: 'Chargement de la fiche…' });

  let show;
  try {
    show = await getShowById(id);
  } catch (error) {
    renderShowError(error, id);
    return;
  }

  document.querySelector('#show-status').replaceChildren();
  renderShow(show);
}

function renderShowError(error, id) {
  // Id valide mais inconnu : l'API répond 404.
  if (error instanceof ApiError && error.status === 404) {
    renderShowNotFound(`Aucune série ne correspond à l'identifiant ${id}.`);
    return;
  }

  renderShowState({
    type: 'error',
    title: 'Impossible de charger cette fiche.',
    message: getErrorMessage(error),
    action: createButton('Réessayer', () => loadShow(id)),
  });
}

function renderShowNotFound(message) {
  document.title = 'Fiche introuvable · StreamFlix';
  renderShowState({
    type: 'not-found',
    title: 'Fiche introuvable',
    message,
    action: createLinkButton('Retour au catalogue', 'index.html'),
  });
}

// Sur la fiche, le titre de l'état est le h1 de la page.
function renderShowState(state) {
  renderState(document.querySelector('#show-status'), { ...state, headingLevel: 1 });
}

function renderShow(show) {
  const watchlistButton = document.querySelector('#watchlist-button');

  document.title = `${show.name} · StreamFlix`;
  document.querySelector('#show-poster').append(createPoster(show.name, getPosterUrl(show, 'original'), 'eager'));
  document.querySelector('#show-title').textContent = show.name;
  document.querySelector('#show-year').textContent = formatYear(getYear(show));
  document.querySelector('#show-network').textContent = formatNetwork(show);
  document.querySelector('#show-airing-status').textContent = formatStatus(show.status);
  document.querySelector('#show-summary').replaceChildren(...createSummary(show.summary));
  fillRating(document.querySelector('#show-rating'), getRating(show));
  fillGenreList(document.querySelector('#show-genres'), show.genres);

  updateWatchlistButton(watchlistButton, show.id);
  watchlistButton.addEventListener('click', () => {
    toggleWatchlist(show);
    updateWatchlistButton(watchlistButton, show.id);
  });

  document.querySelector('#show-detail').hidden = false;
}

function createSummary(summaryHtml) {
  const paragraphs = summaryHtml ? htmlToParagraphs(summaryHtml) : [];

  if (paragraphs.length === 0) {
    return [createElement('p', 'text-muted', 'Aucun résumé disponible pour cette série.')];
  }
  return paragraphs.map((text) => createElement('p', '', text));
}

function toggleWatchlist(show) {
  const feedback = document.querySelector('#watchlist-feedback');

  if (isInWatchlist(show.id)) {
    removeFromWatchlist(show.id);
    showFeedback(feedback, 'success', 'Série retirée de votre liste.');
  } else {
    addToWatchlist(show);
    showFeedback(feedback, 'success', 'Série ajoutée à votre liste.');
  }

  updateWatchlistCount();
}

function updateWatchlistButton(button, showId) {
  const isSaved = isInWatchlist(showId);

  button.textContent = isSaved ? 'Retirer de ma liste' : 'Ajouter à ma liste';
  button.classList.toggle('button-primary', !isSaved);
  button.classList.toggle('button-secondary', isSaved);
}

// Ma liste (liste.html)

function initWatchlistPage() {
  const items = document.querySelector('#watchlist-items');

  items.addEventListener('input', handlePriorityInput);
  items.addEventListener('click', handleRemoveClick);
  document.querySelector('#watchlist-form').addEventListener('submit', handleSelectionSubmit);

  renderWatchlist();
}

function renderWatchlist() {
  const list = getWatchlist();
  const status = document.querySelector('#watchlist-status');

  document.querySelector('#watchlist-count').textContent = formatCount(list.length, 'série retenue', 'séries retenues');
  document.querySelector('#watchlist-form').hidden = list.length === 0;

  if (list.length === 0) {
    renderState(status, {
      type: 'empty',
      title: 'Votre liste est vide.',
      message: "Ouvrez la fiche d'une série depuis le catalogue pour l'ajouter à votre liste.",
      action: createLinkButton('Parcourir le catalogue', 'index.html'),
    });
    return;
  }

  status.replaceChildren();
  document.querySelector('#watchlist-items').replaceChildren(...list.map(createWatchlistItem));
}

function createWatchlistItem(item) {
  const row = cloneTemplate('#watchlist-item-template');
  const link = row.querySelector('.watchlist-link');
  const input = row.querySelector('.priority-input');
  const inputId = `priority-${item.id}`;

  link.href = getShowUrl(item.id);
  link.textContent = item.name;
  row.querySelector('.watchlist-media').append(createPoster(item.name, item.image));
  row.querySelector('.watchlist-year').textContent = formatYear(item.year);
  row.querySelector('.remove-button').dataset.id = item.id;
  row.querySelector('.remove-button-context').textContent = ` ${item.name}`;

  // Ids uniques pour relier le libellé, le champ et son message d'erreur.
  input.id = inputId;
  input.value = item.priority;
  input.dataset.id = item.id;
  input.setAttribute('aria-describedby', `${inputId}-error`);
  row.querySelector('.priority-label').htmlFor = inputId;
  row.querySelector('.field-error').id = `${inputId}-error`;

  return row;
}

function handlePriorityInput(event) {
  const input = event.target;

  if (input.matches('.priority-input') && validatePriorityField(input)) {
    updatePriority(Number(input.dataset.id), Number(input.value));
  }
}

// Affiche ou efface l'erreur du champ, et renvoie s'il est valide.
function validatePriorityField(input) {
  const isValid = isValidPriority(input.value);

  input.setAttribute('aria-invalid', String(!isValid));
  input.closest('.watchlist-item').querySelector('.field-error').textContent = isValid ? '' : PRIORITY_ERROR;
  return isValid;
}

function handleRemoveClick(event) {
  const button = event.target.closest('.remove-button');
  if (!button) return;

  removeFromWatchlist(Number(button.dataset.id));
  updateWatchlistCount();
  renderWatchlist();

  // La ligne supprimée avait le focus : on le remet sur le titre.
  document.querySelector('#watchlist-title').focus();
}

async function handleSelectionSubmit(event) {
  event.preventDefault();
  const feedback = document.querySelector('#submit-feedback');

  // On vérifie tous les champs pour afficher toutes les erreurs.
  const inputs = [...document.querySelectorAll('.priority-input')];
  const invalidInputs = inputs.filter((input) => !validatePriorityField(input));

  if (invalidInputs.length > 0) {
    showFeedback(feedback, 'error', "Corrigez les priorités signalées avant d'envoyer votre sélection.");
    invalidInputs[0].focus();
    return;
  }

  setSubmitting(true);
  showFeedback(feedback, 'pending', 'Envoi de votre sélection…');

  try {
    const response = await sendSelection(buildSelectionPayload());
    showFeedback(feedback, 'success', `Sélection envoyée (n° ${response.id}).`);
  } catch (error) {
    showFeedback(feedback, 'error', `L'envoi a échoué. ${getErrorMessage(error)}`);
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
  const button = document.querySelector('#submit-button');

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
