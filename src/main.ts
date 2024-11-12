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

// Interface for coin
interface Coin {
  cell: Cell;
  serial: number;
}

// Create a div function
function createDiv() {
  const div = document.createElement("div");
  return div;
}

// Create div for app title
const appTitle = createDiv();
appTitle.innerHTML = "Geocoin Carrier";
appTitle.style.textAlign = "center";
appTitle.style.fontSize = "2rem";
appTitle.style.fontWeight = "bold";
document.body.appendChild(appTitle);

// Create div for control panel
const controlPanel = createDiv();
controlPanel.style.display = "flex";
controlPanel.style.justifyContent = "center";
document.body.appendChild(controlPanel);

// Create div for map
const mapDiv = createDiv();
mapDiv.style.width = "100vw";
mapDiv.style.height = "50vh";
document.body.appendChild(mapDiv);

// Create div for inventory
const inventory = createDiv();
inventory.style.display = "flex";
inventory.style.justifyContent = "center";
document.body.appendChild(inventory);
inventory.innerHTML = "Inventory: No coins collected.";

// Classroom location
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map
const map = leaflet.map(mapDiv, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add player marker
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip(
  `Player at ${formatCoord(OAKES_CLASSROOM.lat)}, ${
    formatCoord(OAKES_CLASSROOM.lng)
  }`,
);
playerMarker.addTo(map);

// Map for unique cache data storage
const cacheDataMap = new Map<string, Cache>();

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

// Player inventory management
const playerInventory = {
  coins: [] as Coin[],
};

// Format latitude or longitude
function formatCoord(coord: number) {
  if (coord >= 0) {
    return Math.floor(coord * 10000);
  } else {
    return Math.ceil(coord * 10000);
  }
}

// Update inventory UI
function updateInventory(coin: Coin, action: "add" | "remove") {
  if (action === "add") {
    playerInventory.coins.push(coin);
  } else {
    playerInventory.coins = playerInventory.coins.filter((c) =>
      !(c.cell.lat === formatCoord(coin.cell.lat) &&
        c.cell.lng === formatCoord(coin.cell.lng) && c.serial === coin.serial)
    );
  }
  inventory.innerHTML = `Inventory: ${
    playerInventory.coins.length > 0
      ? playerInventory.coins.map((coin) =>
        `${formatCoord(coin.cell.lat)}:${
          formatCoord(coin.cell.lng)
        }#${coin.serial}`
      ).join(", ")
      : "No coins collected."
  }`;
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

// Convert latitude and longitude to global grid coordinates based on Null Island
function latLngToGrid(lat: number, lng: number) {
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

// Add caches with coins to the map by latitude and longitude
function spawnCache(i: number, j: number) {
  // Calculate latitude and longitude based on global i, j grid coordinates
  const lat = i * TILE_DEGREES;
  const lng = j * TILE_DEGREES;
  const cell = getCell(lat, lng);
  const cacheKey = `${cell.lat}:${cell.lng}`;

  // Initialize cache and coins if it doesn't exist
  if (!cacheDataMap.has(cacheKey)) {
    const initialCoins = Math.floor(
      luck([lat, lng, "initialValue"].toString()) * 10,
    );
    const coins: Coin[] = [];
    for (let serial = 0; serial < initialCoins; serial++) {
      coins.push({ cell, serial });
    }
    cacheDataMap.set(cacheKey, { cell, coins });
  }

  const cache = cacheDataMap.get(cacheKey)!;

  // Define bounds for cache on map
  const bounds = leaflet.latLngBounds([
    [lat, lng],
    [lat + TILE_DEGREES, lng + TILE_DEGREES],
  ]);

  // Rectangle to represent cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);
  rect.bindTooltip(
    `Cache at global grid cell {i: ${i}, j: ${j}}`,
  );

  // Handle cache interactions with a popup
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache at global grid cell {i: ${i}, j: ${j}}.</div>
      <div>Coins in cache:</div>
      <ul id="coinList">${
      cache.coins.map((coin) => `<li>${i}:${j}#${coin.serial}</li>`).join("")
    }</ul>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>`;

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
      "click",
      () => {
        if (cache.coins.length > 0) {
          const coin = cache.coins.pop()!;
          updateInventory(coin, "add");
          updatePopupCoins(cache.coins, popupDiv);
        }
      },
    );

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
      "click",
      () => {
        const playerCoins = playerInventory.coins;
        if (playerCoins.length > 0) {
          const coin = playerCoins.pop()!;
          cache.coins.push(coin);
          updateInventory(coin, "remove");
          updatePopupCoins(cache.coins, popupDiv);
        }
      },
    );
    updatePopupCoins(cache.coins, popupDiv);

    return popupDiv;
  });
}

// Spawn caches across neighborhood grid using global grid cell indices
for (
  let i = latLngToGrid(OAKES_CLASSROOM.lat, OAKES_CLASSROOM.lng).i -
    NEIGHBORHOOD_SIZE;
  i <=
    latLngToGrid(OAKES_CLASSROOM.lat, OAKES_CLASSROOM.lng).i +
      NEIGHBORHOOD_SIZE;
  i++
) {
  for (
    let j = latLngToGrid(OAKES_CLASSROOM.lat, OAKES_CLASSROOM.lng).j -
      NEIGHBORHOOD_SIZE;
    j <=
      latLngToGrid(OAKES_CLASSROOM.lat, OAKES_CLASSROOM.lng).j +
        NEIGHBORHOOD_SIZE;
    j++
  ) {
    if (luck([i, j, "spawn"].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
