// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Interface for cell
interface Cell {
  lat: number;
  lng: number;
}

// Interface for cache
interface Cache {
  cell: Cell;
  coins: Coin[];
}

// Memento pattern for cache state preservation
interface CacheMemento {
  [key: string]: Cache;
}

// Interface for coin
interface Coin {
  cell: Cell;
  serial: number;
}

// Utility function to create a div element
function createDiv(innerHTML = "", styles: Partial<CSSStyleDeclaration> = {}) {
  const div = document.createElement("div");
  div.innerHTML = innerHTML;
  Object.assign(div.style, styles);
  return div;
}

// App title div
const appTitle = createDiv("Geocoin Carrier", {
  textAlign: "center",
  fontSize: "2rem",
  fontWeight: "bold",
});
document.body.appendChild(appTitle);

// Control panel div
const controlPanel = createDiv("", {
  display: "flex",
  justifyContent: "center",
});
document.body.appendChild(controlPanel);

// Movement buttons
const directions = ["⬆️", "⬇️", "⬅️", "➡️", "🌐", "🚮"];
const movementButtons = directions.map((dir) => {
  const button = document.createElement("button");
  button.innerText = dir;
  button.style.margin = "5px";
  controlPanel.appendChild(button);
  return button;
});

// Map div
const mapDiv = createDiv("", { width: "100vw", height: "50vh" });
document.body.appendChild(mapDiv);

// Inventory div
const inventory = createDiv("Inventory: No coins collected.", {
  display: "flex",
  justifyContent: "center",
});
document.body.appendChild(inventory);

// Change the css style of the inventory display so that the coins are displayed in the next line if the player has too many coins
inventory.style.flexWrap = "wrap";
inventory.style.maxWidth = "100%";
inventory.style.overflow = "auto";
inventory.style.textAlign = "center";
inventory.style.margin = "10px";

// Retrieve saved state from localStorage
const savedState = JSON.parse(localStorage.getItem("gameState") || "{}");

// Initial player location, or load from saved state
let playerLocation = savedState.playerLocation
  ? leaflet.latLng(savedState.playerLocation.lat, savedState.playerLocation.lng)
  : leaflet.latLng(36.98949379578401, -122.06277128548504);
let watchId: number | null = null;

// Gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Initialize map
const map = leaflet.map(mapDiv, {
  center: playerLocation,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

const polyline = leaflet.polyline([], { color: "blue" }).addTo(map);

// Background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Player marker with tooltip
const playerMarker = leaflet.marker(playerLocation);
playerMarker.bindTooltip(
  `Player at ${formatCoord(playerLocation.lat)}, ${
    formatCoord(playerLocation.lng)
  }`,
);
playerMarker.addTo(map);

// Cache storage and memento storage
const cacheDataMap = new Map<string, Cache>();
const cacheMementos: CacheMemento = savedState.cacheMementos || {};

// Flyweight pattern for unique Cell instances
interface CellFlyweight {
  getCell(lat: number, lng: number): Cell;
}
const cellMap = new Map<string, Cell>();
const getCell: CellFlyweight["getCell"] = (lat, lng) => {
  const key = `${lat}:${lng}`;
  if (!cellMap.has(key)) {
    cellMap.set(key, { lat, lng });
  }
  return cellMap.get(key)!;
};

// Initialize player inventory with saved coins, if any
const playerInventory = { coins: savedState.coins || [] };

// Format latitude or longitude
function formatCoord(coord: number) {
  return Math.round(coord * 10000);
}

// Updates the game state for the player's inventory
function updateInventoryState(
  coin: Coin | null = null,
  action: "add" | "remove" | "init" = "init",
) {
  if (action === "add" && coin) {
    playerInventory.coins.push(coin);
  } else if (action === "remove" && coin) {
    playerInventory.coins = playerInventory.coins.filter(
      (c: Coin) =>
        !(c.cell.lat === coin.cell.lat &&
          c.cell.lng === coin.cell.lng &&
          c.serial === coin.serial),
    );
  }

  // Save the updated game state after every change
  saveGameState();
}

// Updates the UI to reflect the current state of the player's inventory
function updateInventoryUI() {
  inventory.innerHTML = `Inventory: ${
    playerInventory.coins.length > 0
      ? playerInventory.coins
        .map(
          (coin: Coin) =>
            `<span class="coin-id" data-lat="${coin.cell.lat}" data-lng="${coin.cell.lng}">
              ${formatCoord(coin.cell.lat)}:${
              formatCoord(coin.cell.lng)
            }#${coin.serial}
            </span>`,
        )
        .join(", ")
      : "No coins collected."
  }`;

  // Add event listeners to center the map when an inventory item is clicked
  document.querySelectorAll(".coin-id").forEach((element) => {
    element.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const lat = parseFloat(target.dataset.lat!);
      const lng = parseFloat(target.dataset.lng!);
      map.setView([lat, lng], GAMEPLAY_ZOOM_LEVEL);
    });
  });
}

// Wrapper function to tie everything together
function updateInventory(
  coin: Coin | null = null,
  action: "add" | "remove" | "init" = "init",
) {
  updateInventoryState(coin, action);
  updateInventoryUI();
}

// Save game state to localStorage
function saveGameState() {
  const gameState = {
    playerLocation,
    coins: playerInventory.coins,
    cacheMementos,
  };
  localStorage.setItem("gameState", JSON.stringify(gameState));
}

// Update popup with current coin list
function updatePopupCoins(coins: Coin[], popupDiv: HTMLDivElement) {
  const coinList = popupDiv.querySelector("#coinList")!;
  coinList.innerHTML = coins.map((coin) =>
    `<li>${formatCoord(coin.cell.lat)}:${
      formatCoord(coin.cell.lng)
    }#${coin.serial}</li>`
  ).join("");
}

// Convert latitude and longitude to global grid coordinates
function latLngToGrid(lat: number, lng: number) {
  return {
    i: Math.floor(lat / TILE_DEGREES),
    j: Math.floor(lng / TILE_DEGREES),
  };
}

// Handles cache retrieval or creation
function getOrCreateCache(i: number, j: number): Cache {
  const lat = i * TILE_DEGREES;
  const lng = j * TILE_DEGREES;
  const cell = getCell(lat, lng);
  const cacheKey = `${cell.lat}:${cell.lng}`;

  // Check if exists in cacheDataMap or retrieve from cacheMementos
  if (!cacheDataMap.has(cacheKey)) {
    const mementoCache = cacheMementos[cacheKey];
    if (mementoCache) {
      cacheDataMap.set(cacheKey, mementoCache);
    } else {
      // Create a new cache
      const coins: Coin[] = Array.from(
        {
          length: Math.floor(luck([lat, lng, "initialValue"].toString()) * 10),
        },
        (_, serial) => ({ cell, serial }),
      );
      cacheDataMap.set(cacheKey, { cell, coins });
    }
  }

  const cache = cacheDataMap.get(cacheKey)!;
  cacheMementos[cacheKey] = cache; // Ensure memento is updated
  return cache;
}

// Handles rendering cache on the map
function drawCacheOnMap(cache: Cache, i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [cache.cell.lat, cache.cell.lng],
    [cache.cell.lat + TILE_DEGREES, cache.cell.lng + TILE_DEGREES],
  ]);

  // Draw rectangle and bind tooltip
  const rect = leaflet.rectangle(bounds).addTo(map).bindTooltip(
    `Cache at global grid cell {i: ${i}, j: ${j}}`,
  );

  rect.bindPopup(() => createCachePopup(cache, i, j));
}

// Creates the popup UI for a cache and sets up its buttons
function createCachePopup(cache: Cache, i: number, j: number): HTMLDivElement {
  const popupDiv = document.createElement("div");
  popupDiv.innerHTML = `
    <div>Cache at global grid cell {i: ${i}, j: ${j}}.</div>
    <div>Coins in cache:</div>
    <ul id="coinList">${
    cache.coins
      .map((coin) => `<li>${i}:${j}#${coin.serial}</li>`)
      .join("")
  }</ul>
    <button id="collect">Collect</button>
    <button id="deposit">Deposit</button>`;

  // Add event listeners to collect and deposit buttons
  popupDiv.querySelector("#collect")!.addEventListener("click", () => {
    if (cache.coins.length > 0) {
      const coin = cache.coins.pop()!;
      updateInventory(coin, "add");
      updatePopupCoins(cache.coins, popupDiv);
      saveGameState(); // Save state after collecting
    }
  });

  popupDiv.querySelector("#deposit")!.addEventListener("click", () => {
    if (playerInventory.coins.length > 0) {
      const coin = playerInventory.coins.pop()!;
      cache.coins.push(coin);
      updateInventory(coin, "remove");
      updatePopupCoins(cache.coins, popupDiv);
      saveGameState(); // Save state after depositing
    }
  });

  updatePopupCoins(cache.coins, popupDiv);
  return popupDiv;
}

// Combines all the extracted functions into the spawnCache function
function spawnCache(i: number, j: number) {
  const cache = getOrCreateCache(i, j); // Retrieve or create cache
  drawCacheOnMap(cache, i, j); // Render the cache on the map
}

// Moves the player and updates the polyline
function movePlayer(deltaLat: number, deltaLng: number) {
  // Update player location by creating a new LatLng with adjusted coordinates
  playerLocation = leaflet.latLng(
    playerLocation.lat + deltaLat,
    playerLocation.lng + deltaLng,
  );

  playerMarker.setLatLng(playerLocation);
  map.setView(playerLocation);

  // Update the player's path on the map
  polyline.addLatLng(playerLocation);

  // Call helper functions
  clearOutOfViewCaches();
  spawnNearbyCaches();

  // Save game state after every move
  saveGameState();
}

// Clears out-of-view caches and removes their map layers
function clearOutOfViewCaches() {
  cacheDataMap.clear(); // Clear currently visible cache data
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Rectangle) {
      map.removeLayer(layer); // Remove rectangle layers representing caches
    }
  });
}

// Spawns caches near the player's current location
function spawnNearbyCaches() {
  const { i, j } = latLngToGrid(playerLocation.lat, playerLocation.lng);

  for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
      if (
        luck([i + di, j + dj, "spawn"].toString()) < CACHE_SPAWN_PROBABILITY
      ) {
        spawnCache(i + di, j + dj); // Use the refactored spawnCache function
      }
    }
  }
}

// Define movement deltas for each direction to avoid variable naming conflict
const movementDeltas: [number, number][] = [
  [TILE_DEGREES, 0], // ⬆️
  [-TILE_DEGREES, 0], // ⬇️
  [0, -TILE_DEGREES], // ⬅️
  [0, TILE_DEGREES], // ➡️
];

// Add event listeners for each movement button
movementButtons.forEach((button, index) =>
  button.addEventListener("click", () => {
    if (directions[index] === "🌐") {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      } else {
        watchId = navigator.geolocation.watchPosition(
          (position) =>
            movePlayer(
              position.coords.latitude - playerLocation.lat,
              position.coords.longitude - playerLocation.lng,
            ),
          console.error,
        );
      }
    } else if (directions[index] === "🚮") {
      if (confirm("Are you sure you want to reset the game state?")) {
        playerInventory.coins = [];
        updateInventory({} as Coin, "remove");
        polyline.setLatLngs([]);
        localStorage.removeItem("gameState"); // Clear saved state
      }
    } else {
      movePlayer(movementDeltas[index][0], movementDeltas[index][1]);
    }
  })
);

// Spawn initial caches
movePlayer(0, 0);

// Update the inventory display on page load
updateInventory(null, "init");
