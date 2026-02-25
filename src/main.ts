import "./styles.scss";

type CataasCat = {
  id?: string;   // what your API returns
  _id?: string;  // some versions may return this
  tags?: string[];
};

type CatItem = {
  id: string;
  imageUrl: string;
};

const TARGET_TOTAL = 15;
let isFetchingMore = false;

const deckSectionEl = document.querySelector("section.deck") as HTMLElement;
const deckEl = document.getElementById("deck") as HTMLDivElement;
const counterEl = document.getElementById("counter") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const hintEl = document.getElementById("hint") as HTMLDivElement;

const btnLike = document.getElementById("btnLike") as HTMLButtonElement;
const btnDislike = document.getElementById("btnDislike") as HTMLButtonElement;

const summaryEl = document.getElementById("summary") as HTMLElement;
const summaryTextEl = document.getElementById("summaryText") as HTMLParagraphElement;
const likedGridEl = document.getElementById("likedGrid") as HTMLDivElement;
const btnRestart = document.getElementById("btnRestart") as HTMLButtonElement;

let cats: CatItem[] = [];
let currentIndex = 0;
let liked: CatItem[] = [];

async function fetchMoreIfNeeded() {
  if (isFetchingMore) return;
  if (cats.length >= TARGET_TOTAL) return;

  // when user is close to the end, fetch more
  const remaining = cats.length - currentIndex;
  if (remaining > 3) return;

  isFetchingMore = true;
  try {
    const need = TARGET_TOTAL - cats.length;
    const more = await fetchCats(Math.min(6, need), []); // fetch up to 6 each time

    // avoid duplicates by id
    const existing = new Set(cats.map((c) => c.id));
    const filtered = more.filter((c) => !existing.has(c.id));

    cats = cats.concat(filtered);

    // preload a couple after appending
    preloadUpcoming(currentIndex, 2);
    setCounter();
  } finally {
    isFetchingMore = false;
  }
}

function preloadImage(url: string): void {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

function preloadUpcoming(fromIndex: number, count: number): void {
  cats.slice(fromIndex, fromIndex + count).forEach((c) => preloadImage(c.imageUrl));
}

function setCounter() {
  counterEl.textContent = `${Math.min(currentIndex + 1, cats.length)} / ${cats.length}`;
  if (cats.length === 0) counterEl.textContent = `0 / 0`;
}

async function fetchCats(limit = 15, tags: string[] = []) {
  const params = new URLSearchParams();
  params.set("skip", "0");
  params.set("limit", String(limit));
  if (tags.length) params.set("tags", tags.join(","));

  const url = `https://cataas.com/api/cats?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Failed to fetch cats: ${res.status}`);

  const data = (await res.json()) as CataasCat[];

  const items = data
    .map((c) => c.id ?? c._id)                 // use id first
    .filter((id): id is string => !!id && id.length > 0)
    .map((id) => ({
      id,
      imageUrl: `https://cataas.com/cat/${encodeURIComponent(id)}?width=500&height=700`
    }));

  return items;
}

function clearDeck() {
  deckEl.innerHTML = "";
}

function showError(message: string) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function hideError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

function showSummary() {
  // Hide the entire deck section (cards + buttons + hint)
  deckSectionEl.hidden = true;

  // Show summary only
  summaryEl.hidden = false;

  summaryTextEl.textContent = `You liked ${liked.length} out of ${cats.length} cats.`;

  likedGridEl.innerHTML = "";
  if (liked.length === 0) {
    likedGridEl.innerHTML = `<div class="hint" style="grid-column: 1 / -1;">No likes this time. Restart and try again.</div>`;
    return;
  }

  for (const cat of liked) {
    const div = document.createElement("div");
    div.className = "thumb";
    const thumbUrl = `https://cataas.com/cat/${encodeURIComponent(cat.id)}?width=260&height=260`;
    div.innerHTML = `<img alt="Liked cat" loading="lazy" decoding="async" src="${thumbUrl}" />`;
    likedGridEl.appendChild(div);
  }
}

function resetUIForDeck() {
  // Show deck section again
  deckSectionEl.hidden = false;

  // Hide summary
  summaryEl.hidden = true;

  // Ensure normal UI parts show again
  errorEl.hidden = true;
  hintEl.hidden = false;

  const actionsEl = deckSectionEl.querySelector(".actions") as HTMLElement | null;
  if (actionsEl) actionsEl.hidden = false;
}

function createCard(cat: CatItem, positionFromTop: number) {
  const card = document.createElement("div");
  card.className = "card";
  
  // Calculate how many cards remain
  const remaining = cats.slice(currentIndex);
  const totalCards = remaining.length;
  
  let scale: number;
  let translateY: number;
  
  if (totalCards === 1) {
    // Only 1 card left
    scale = 1;
    translateY = 0;
  } else if (totalCards === 2) {
    // Only 2 cards left
    scale = positionFromTop === 0 ? 1 : 0.95;
    translateY = positionFromTop === 0 ? 0 : -16;
  } else {
    // 3+ cards (normal)
    scale = 1 - (positionFromTop * 0.05); // 1.00， 0.95， 0.90
    translateY = -(positionFromTop * 35);
  }
  
  // Set z-index so position 0 (front) is on top
  const zIndex = 100 - positionFromTop;
  
  card.style.transform = `translateY(${translateY}px) scale(${scale})`;
  card.style.zIndex = String(zIndex);
  
  const loadingMode = positionFromTop === 0 ? "eager" : "lazy";

  card.innerHTML = `
    <img loading="${loadingMode}" decoding="async" src="${cat.imageUrl}" alt="Cat photo" draggable="false" />
    <div class="card__overlay"></div>
    <div class="badge badge--like" data-badge-like>LIKE</div>
    <div class="badge badge--nope" data-badge-nope>NOPE</div>
  `;

  const img = card.querySelector("img") as HTMLImageElement;
  card.classList.add("is-loading");

  img.addEventListener("load", () => card.classList.remove("is-loading"));
  img.addEventListener("error", () => card.classList.remove("is-loading"));

  // only top card is interactive
  if (positionFromTop === 0) {
    attachSwipeHandlers(card, cat);
  }

  return card;
}

function renderDeck() {
  clearDeck();
  setCounter();

  // Render in forward order: position 0 (front), 1 (middle), 2 (back)
  const remaining = cats.slice(currentIndex);
  const visible = remaining.slice(0, 3);

  for (let i = 0; i < visible.length; i++) {
    const card = createCard(visible[i], i);
    deckEl.appendChild(card);
  }
}

function goNext() {
  currentIndex++;
  if (currentIndex >= cats.length) {
    setCounter();
    counterEl.textContent = `${cats.length} / ${cats.length}`;
    showSummary();
    return;
  }
  fetchMoreIfNeeded();
  preloadUpcoming(currentIndex, 2);
  renderDeck();
}

function vote(cat: CatItem, isLike: boolean) {
  if (isLike) liked.push(cat);
  goNext();
}

function animateAndVote(card: HTMLElement, cat: CatItem, isLike: boolean) {
  const x = isLike ? window.innerWidth : -window.innerWidth;
  const rot = isLike ? 18 : -18;
  card.style.transition = "transform 220ms ease";
  card.style.transform = `translate(${x}px, -20px) rotate(${rot}deg)`;
  window.setTimeout(() => vote(cat, isLike), 200);
}

function attachSwipeHandlers(card: HTMLDivElement, cat: CatItem) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let dragging = false;

  const likeBadge = card.querySelector("[data-badge-like]") as HTMLDivElement;
  const nopeBadge = card.querySelector("[data-badge-nope]") as HTMLDivElement;

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    card.setPointerCapture(e.pointerId);
    card.style.transition = "none";

    startX = e.clientX;
    startY = e.clientY;
    currentX = 0;
    currentY = 0;
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;

    currentX = e.clientX - startX;
    currentY = e.clientY - startY;

    const rotate = Math.max(-18, Math.min(18, currentX / 18));
    card.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotate}deg)`;

    const strength = Math.min(1, Math.abs(currentX) / 90);
    if (currentX > 0) {
      likeBadge.style.opacity = String(strength);
      nopeBadge.style.opacity = "0";
    } else {
      nopeBadge.style.opacity = String(strength);
      likeBadge.style.opacity = "0";
    }
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;

    const threshold = 110; // swipe threshold in px
    const likedIt = currentX > threshold;
    const dislikedIt = currentX < -threshold;

    likeBadge.style.opacity = "0";
    nopeBadge.style.opacity = "0";

    if (likedIt || dislikedIt) {
      const isLike = likedIt;
      animateAndVote(card, cat, isLike);
      return;
    }

    // snap back
    card.style.transition = "transform 200ms ease";
    card.style.transform = `translate(0px, 0px) rotate(0deg)`;
  };

  card.addEventListener("pointerdown", onPointerDown);
  card.addEventListener("pointermove", onPointerMove);
  card.addEventListener("pointerup", onPointerUp);
  card.addEventListener("pointercancel", onPointerUp);
}

function getTopCat(): CatItem | null {
  return cats[currentIndex] ?? null;
}

function bindButtons() {
  btnLike.addEventListener("click", () => {
    const cat = getTopCat();
    if (!cat) return;
    const topCard = deckEl.querySelector(".card") as HTMLElement | null;
    if (topCard) animateAndVote(topCard, cat, true);
    else vote(cat, true);
  });

  btnDislike.addEventListener("click", () => {
    const cat = getTopCat();
    if (!cat) return;
    const topCard = deckEl.querySelector(".card") as HTMLElement | null;
    if (topCard) animateAndVote(topCard, cat, false);
    else vote(cat, false);
  });

  btnRestart.addEventListener("click", () => {
    start();
  });
}

async function start() {
  hideError();
  resetUIForDeck();

  loadingEl.removeAttribute("hidden");

  cats = [];
  liked = [];
  currentIndex = 0;
  setCounter();
  clearDeck();

  try {
    // Example tags: ["cute", "kitten"] (optional). Keep empty for variety.
    cats = await fetchCats(6, []); // or [] for random
    if (cats.length === 0) throw new Error("No cats returned from API.");

    preloadUpcoming(0, 3);
    renderDeck();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    showError(`Could not load cats. ${msg}`);
  } finally {
    loadingEl.setAttribute("hidden", "true");
  }
}

bindButtons();
start();