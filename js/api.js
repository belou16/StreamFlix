// Tous les appels réseau du site.

// URL de l'API : la seule ligne à changer pour passer en production.
const API_BASE_URL = 'https://api.tvmaze.com';

// Service de test pour l'envoi de la sélection.
const SELECTION_URL = 'https://jsonplaceholder.typicode.com/posts';

// Erreur réseau : status vaut null. Erreur HTTP : status contient le code.
export class ApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Lance une requête et gère les 3 cas : erreur réseau, erreur HTTP, succès.
async function request(url, options = {}) {
  let response;

  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError('Le serveur est injoignable. Vérifiez votre connexion puis réessayez.');
  }

  // fetch ne lève pas d'erreur sur un 404 ou un 500 : on vérifie response.ok.
  if (!response.ok) {
    throw new ApiError(`Le serveur a répondu par une erreur (code ${response.status}).`, response.status);
  }

  return response.json();
}

export async function getShows(page = 0) {
  return request(`${API_BASE_URL}/shows?page=${page}`);
}

export async function getShowById(id) {
  return request(`${API_BASE_URL}/shows/${id}`);
}

export async function searchShows(text) {
  const results = await request(`${API_BASE_URL}/search/shows?q=${encodeURIComponent(text)}`);

  // L'API renvoie { score, show } : on garde seulement show.
  return results.map((result) => result.show);
}

export async function sendSelection(payload) {
  return request(SELECTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
  });
}
