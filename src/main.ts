import "./styles.scss";

type CataasCat = {
  id?: string;
  _id?: string;
  tags?: string[];
  mimetype?: string; // correct field from API
  mime?: string;     // keep fallback (just in case)
};

type CatItem = {
  id: string;
  imageUrl: string;
  mime?: string; // track the content type
};

type VoteHistoryItem = {
  index: number;      // index BEFORE voting
  cat: CatItem;
  isLike: boolean;
};

let history: VoteHistoryItem[] = [];
let isAnimating = false;
let lastVotedIndex: number | null = null;

const TARGET_TOTAL = 15;
let isFetchingMore = false;

const deckSectionEl = document.querySelector(".deck") as HTMLElement;
const deckEl = document.getElementById("deck") as HTMLDivElement;
const counterEl = document.getElementById("counter") as HTMLDivElement;
const loadingEl = document.getElementById("loading") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const hintEl = document.getElementById("hint") as HTMLDivElement;

const btnLike = document.getElementById("btnLike") as HTMLButtonElement;
const btnDislike = document.getElementById("btnDislike") as HTMLButtonElement;
const btnUndo = document.getElementById("btnUndo") as HTMLButtonElement;

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
  if (remaining > 5) return;

  isFetchingMore = true;
  try {
    const need = TARGET_TOTAL - cats.length;
    const more = await fetchCats(Math.min(6, need), [], cats.length); // pass skip parameter

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

function setActionsEnabled(enabled: boolean) {
  btnLike.disabled = !enabled;
  btnDislike.disabled = !enabled;
  btnUndo.disabled = !enabled && history.length === 0 ? true : !enabled;
  // better: keep undo enabled only when not animating
  if (!enabled) btnUndo.disabled = true;
  else updateUndoState();
}

function preloadUpcoming(fromIndex: number, count: number): void {
  cats.slice(fromIndex, fromIndex + count).forEach((c) => preloadImage(c.imageUrl));
}

function setCounter() {
  counterEl.textContent = `${Math.min(currentIndex + 1, cats.length)} / ${TARGET_TOTAL}`;
  if (cats.length === 0) counterEl.textContent = `0 / ${TARGET_TOTAL}`;
}

async function fetchCats(limit = 15, tags: string[] = [], skip = 0) {
  const params = new URLSearchParams();
  params.set("skip", String(skip));
  params.set("limit", String(limit));
  if (tags.length) params.set("tags", tags.join(","));

  const url = `https://cataas.com/api/cats?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Failed to fetch cats: ${res.status}`);

  const data = (await res.json()) as CataasCat[];

  const items = data
    .map((c) => c.id ?? c._id)
    .filter((id): id is string => !!id && id.length > 0)
    .map((id, index) => {
      const mime = data[index].mimetype ?? data[index].mime ?? "image/jpeg";

      const isVideo = mime.startsWith("video/");
      const isGif = mime.startsWith("image/gif") || mime.includes("gif");

      const imageUrl =
        isVideo || isGif
          ? `https://cataas.com/cat/${encodeURIComponent(id)}`
          : `https://cataas.com/cat/${encodeURIComponent(id)}?width=400&height=400`;

      return { id, imageUrl, mime };
    });
  console.log(items.map(x => ({ id: x.id, mime: x.mime, url: x.imageUrl })));

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
  document.body.classList.add("show-summary");
  // Show summary only
  summaryEl.hidden = false;

  summaryTextEl.textContent = `You liked ${liked.length} out of ${TARGET_TOTAL} cats.`;

  likedGridEl.innerHTML = "";
  if (liked.length === 0) {
    likedGridEl.innerHTML = `<div class="hint" style="grid-column: 1 / -1;">No likes this time. Restart and try again.</div>`;
    return;
  }

  for (const cat of liked) {
    const div = document.createElement("div");
    div.className = "thumb";
    
    const isVideo = !!cat.mime && cat.mime.startsWith("video/");
const isGif = cat.mime === "image/gif";

const thumbUrl =
  isVideo || isGif
    ? `https://cataas.com/cat/${encodeURIComponent(cat.id)}`
    : `https://cataas.com/cat/${encodeURIComponent(cat.id)}?width=500&height=700`;
    
    if (isVideo) {
      div.innerHTML = `<video autoplay muted playsinline alt="Liked cat video" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block;" src="${thumbUrl}" />`;
    } else {
      div.innerHTML = `<img alt="Liked cat" loading="lazy" decoding="async" src="${thumbUrl}" />`;
    }
    likedGridEl.appendChild(div);
  }
}

function resetUIForDeck() {
  // Show deck section again
  deckSectionEl.hidden = false;
  document.body.classList.remove("show-summary");
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

  // Always render a visible stack (downward + smaller)
  const scaleStep = 0.05;     // smaller for each card behind
  const offsetStep = 18;      // push down for each card behind
  const opacityStep = 0.10;   // slight fade for depth

  const scale = 1 - positionFromTop * scaleStep;          // 1, 0.95, 0.90
  const translateY = positionFromTop * offsetStep;        // 0, 18, 36
  const opacity = 1 - positionFromTop * opacityStep;      // 1, 0.9, 0.8

  card.style.transform = `translateY(${translateY}px) scale(${scale})`;
  card.style.opacity = String(opacity);
  card.style.zIndex = String(100 - positionFromTop);

  const loadingMode = positionFromTop === 0 ? "eager" : "lazy";
  const isVideo = cat.mime && cat.mime.startsWith("video/");

  if (isVideo) {
    card.innerHTML = `
      <video autoplay muted playsinline src="${cat.imageUrl}" style="width:100%;height:100%;object-fit:cover;display:block;"></video>
      <div class="card__tint"></div>
      <div class="card__overlay"></div>
      <div class="badge badge--like" data-badge-like>LIKE</div>
      <div class="badge badge--nope" data-badge-nope>NOPE</div>
    `;
  } else {
    card.innerHTML = `
      <img loading="${loadingMode}" decoding="async" src="${cat.imageUrl}" alt="Cat photo" draggable="false" />
      <div class="card__tint"></div>
      <div class="card__overlay"></div>
      <div class="badge badge--like" data-badge-like>LIKE</div>
      <div class="badge badge--nope" data-badge-nope>NOPE</div>
    `;
  }

  if (positionFromTop === 0) attachSwipeHandlers(card, cat);
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
  if (currentIndex >= TARGET_TOTAL || currentIndex >= cats.length) {
    setCounter();
    counterEl.textContent = `${TARGET_TOTAL} / ${TARGET_TOTAL}`;
    showSummary();
    return;
  }
  fetchMoreIfNeeded();
  preloadUpcoming(currentIndex, 2);
  renderDeck();
}

function vote(cat: CatItem, isLike: boolean) {
  // Prevent double vote on the same index (fast clicks)
  if (lastVotedIndex === currentIndex) return;
  lastVotedIndex = currentIndex;

  history.push({ index: currentIndex, cat, isLike });
  updateUndoState();

  if (isLike) liked.push(cat);
  goNext();

  // allow next card to be voted
  lastVotedIndex = null;
}

function updateUndoState() {
  btnUndo.disabled = history.length === 0;
}

function undoLast() {
  const last = history.pop();
  updateUndoState();
  if (!last) return;

  // If summary is showing, return to deck view
  if (!summaryEl.hidden) {
    summaryEl.hidden = true;
    deckSectionEl.hidden = false;
    document.body.classList.remove("show-summary");
  }

  // restore index to the card we just voted on
  currentIndex = last.index;

  // If it was a like, remove the last liked match
  if (last.isLike) {
    for (let i = liked.length - 1; i >= 0; i--) {
      if (liked[i].id === last.cat.id) {
        liked.splice(i, 1);
        break;
      }
    }
  }

  // Make sure counter + deck reflect the restored state
  setCounter();
  preloadUpcoming(currentIndex, 2);
  renderDeck();
}

function animateAndVote(card: HTMLElement, cat: CatItem, isLike: boolean) {
  if (isAnimating) return;
  isAnimating = true;
  setActionsEnabled(false);

  // mark card as already voted so it can't be voted again
  if ((card as any).dataset.voted === "1") return;
  (card as any).dataset.voted = "1";

  const x = isLike ? window.innerWidth : -window.innerWidth;
  const rot = isLike ? 18 : -18;

  card.style.transition = "transform 220ms ease";
  card.style.transform = `translate(${x}px, -20px) rotate(${rot}deg) scale(1)`;

  window.setTimeout(() => {
    vote(cat, isLike);
    isAnimating = false;
    setActionsEnabled(true);
  }, 220);
}

function attachSwipeHandlers(card: HTMLDivElement, cat: CatItem) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let dragging = false;

  

  const tintEl = card.querySelector(".card__tint") as HTMLDivElement;
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

    // 0..1 based on swipe distance
    const strength = Math.min(1, Math.abs(currentX) / 140);

    // scale effect (1.00 -> 1.03)
    const scale = 1 + strength * 0.03;

    card.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${rotate}deg) scale(${scale})`;

    // badge opacity
    if (currentX > 0) {
      likeBadge.style.opacity = String(strength);
      nopeBadge.style.opacity = "0";
    } else {
      nopeBadge.style.opacity = String(strength);
      likeBadge.style.opacity = "0";
    }

    // tint alpha (0..0.35)
    const alpha = 0.35 * strength;

    if (currentX > 0) {
      tintEl.style.setProperty("--likeAlpha", String(alpha));
      tintEl.style.setProperty("--nopeAlpha", "0");
    } else {
      tintEl.style.setProperty("--nopeAlpha", String(alpha));
      tintEl.style.setProperty("--likeAlpha", "0");
    }
  };

  
  let hasVoted = false;

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;

    if (hasVoted || isAnimating) return; // block double triggers

    const threshold = 110;
    const likedIt = currentX > threshold;
    const dislikedIt = currentX < -threshold;

    if (likedIt || dislikedIt) {
      hasVoted = true;
      animateAndVote(card, cat, likedIt);
      return;
    }

    card.style.transition = "transform 200ms ease";
    card.style.transform = `translate(0px, 0px) rotate(0deg) scale(1)`;
  };

  card.addEventListener("pointerdown", onPointerDown);
  card.addEventListener("pointermove", onPointerMove);
  card.addEventListener("pointerup", onPointerUp);
  card.addEventListener("pointercancel", onPointerUp);
}

function getTopCat(): CatItem | null {
  return cats[currentIndex] ?? null;
}

// ADD THIS
function getTopCardEl(): HTMLElement | null {
  // Because renderDeck appends cards in order (0,1,2),
  // the TOP card is the FIRST ".card" in the deck.
  return deckEl.querySelector(".card") as HTMLElement | null;
}


async function start() {
  hideError();
  resetUIForDeck();

  loadingEl.removeAttribute("hidden");

  cats = [];
  liked = [];
  history = [];
  currentIndex = 0;
  updateUndoState();
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

function bindButtons() {
  btnLike.addEventListener("click", () => {
    if (isAnimating) return;

    const cat = getTopCat();
    if (!cat) return;

    const topCard = getTopCardEl();
    if (!topCard) return;

    animateAndVote(topCard, cat, true);
  });

  btnDislike.addEventListener("click", () => {
    if (isAnimating) return;

    const cat = getTopCat();
    if (!cat) return;

    const topCard = getTopCardEl();
    if (!topCard) return;

    animateAndVote(topCard, cat, false);
  });

  btnUndo.addEventListener("click", () => {
    if (isAnimating) return;
    undoLast();
  });

  btnRestart.addEventListener("click", () => {
    start();
  });
}

bindButtons();
start();