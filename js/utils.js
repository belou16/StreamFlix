// Fonctions utilisées par les 3 pages.

// Outils

export function createElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);

  if (className) element.className = className;
  if (text) element.textContent = text;

  return element;
}

export function cloneTemplate(selector) {
  return document.querySelector(selector).content.firstElementChild.cloneNode(true);
}

export function debounce(callback, delay) {
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}

// Texte et dates

// Minuscules et sans accents : « pokemon » trouve « Pokémon ».
export function normalizeText(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// formatCount(2, 'série', 'séries') → « 2 séries »
export function formatCount(count, singular, plural) {
  return `${count} ${count > 1 ? plural : singular}`;
}

// Date du jour AAAA-MM-JJ en heure locale (toISOString donne l'heure UTC).
export function getTodayDate() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${today.getFullYear()}-${month}-${day}`;
}

// Le résumé de l'API contient du HTML : on garde seulement le texte (pas d'innerHTML, pas de XSS).
export function htmlToParagraphs(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const paragraphs = [...parsed.querySelectorAll('p')].map((paragraph) => paragraph.textContent.trim());
  const texts = paragraphs.length > 0 ? paragraphs : [parsed.body.textContent.trim()];

  return texts.filter(Boolean);
}

// Données des séries

const STATUS_LABELS = {
  Running: 'En cours',
  Ended: 'Terminée',
  'To Be Determined': 'À déterminer',
  'In Development': 'En développement',
};

const STAR_COUNT = 5;

export function getRating(show) {
  return show.rating?.average ?? null;
}

export function getYear(show) {
  return show.premiered ? Number(show.premiered.slice(0, 4)) : null;
}

export function getPosterUrl(show, size = 'medium') {
  return show.image?.[size] ?? null;
}

export function formatYear(year) {
  return year === null ? 'Année inconnue' : String(year);
}

export function formatRating(rating) {
  return rating.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Note sur 10 → 5 étoiles.
export function formatStars(rating) {
  const filledStars = Math.round(rating / 2);
  return '★'.repeat(filledStars) + '☆'.repeat(STAR_COUNT - filledStars);
}

export function formatNetwork(show) {
  // Séries en streaming : pas de chaîne, mais une plateforme (webChannel).
  return show.network?.name ?? show.webChannel?.name ?? 'Chaîne inconnue';
}

export function formatStatus(status) {
  return STATUS_LABELS[status] ?? status ?? 'Statut inconnu';
}

// Les valeurs manquantes (null) vont toujours à la fin.
export function compareNullable(a, b, direction) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  return (a - b) * direction;
}

// Ma liste

const WATCHLIST_KEY = 'streamflix-watchlist';

// Mêmes bornes que min et max dans liste.html.
export const MIN_PRIORITY = 1;
export const MAX_PRIORITY = 10;

export function getWatchlist() {
  // Données illisibles dans le stockage : on repart d'une liste vide.
  try {
    const savedList = JSON.parse(localStorage.getItem(WATCHLIST_KEY));
    return Array.isArray(savedList) ? savedList : [];
  } catch {
    return [];
  }
}

function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}

export function isInWatchlist(showId) {
  return getWatchlist().some((item) => item.id === showId);
}

export function addToWatchlist(show) {
  const list = getWatchlist();
  if (list.some((item) => item.id === show.id)) return;

  list.push({
    id: show.id,
    name: show.name,
    year: getYear(show),
    image: getPosterUrl(show),
    priority: Math.min(list.length + 1, MAX_PRIORITY),
  });

  saveWatchlist(list);
}

export function removeFromWatchlist(showId) {
  saveWatchlist(getWatchlist().filter((item) => item.id !== showId));
}

export function updatePriority(showId, priority) {
  const list = getWatchlist().map((item) => (item.id === showId ? { ...item, priority } : item));
  saveWatchlist(list);
}

// value est le texte du champ (vide si ce n'est pas un nombre).
export function isValidPriority(value) {
  if (value.trim() === '') return false;

  const priority = Number(value);
  return Number.isInteger(priority) && priority >= MIN_PRIORITY && priority <= MAX_PRIORITY;
}
