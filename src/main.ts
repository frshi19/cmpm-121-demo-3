// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// create interface for cell
interface Cell {
  i: number;
  j: number;
}

// create interface for cache
interface Cache {
  cell: Cell;
  coins: number;
}

// create interface for coin
interface Coin {
  cell: Cell;
  serial: number;
}

// create div function
function createDiv() {
  const div = document.createElement("div");
  return div;
}

// create div for app title
const appTitle = createDiv();
appTitle.innerHTML = "Geocoin Carrier";
appTitle.style.textAlign = "center";
appTitle.style.fontSize = "2rem";
appTitle.style.fontWeight = "bold";
document.body.appendChild(appTitle);

// create div for control panel
const controlPanel = createDiv();
controlPanel.style.display = "flex";
controlPanel.style.justifyContent = "center";
document.body.appendChild(controlPanel);

// create div for map
const mapDiv = createDiv();
mapDiv.style.width = "100vw";
mapDiv.style.height = "50vh";
document.body.appendChild(mapDiv);

// create div for inventory
const inventory = createDiv();
inventory.style.display = "flex";
inventory.style.justifyContent = "center";
document.body.appendChild(inventory);
inventory.innerHTML = "You have 0 coins";

let coins = 0;

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(mapDiv, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a marker to represent the player
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
// add a tooltip to the player marker with the player's latitudes and longitudes
playerMarker.bindTooltip(
  `Player at ${Math.floor(OAKES_CLASSROOM.lat * 10000)}, ${
    Math.ceil(OAKES_CLASSROOM.lng * 10000)
  }`,
);

playerMarker.addTo(map);

// Map to store the coin count for each cache cell based on its coordinates
const cacheCoinsMap = new Map<string, number>();

// Flyweight pattern implementation for Cells without a class
interface CellFlyweight {
  getCell(i: number, j: number): Cell;
}

// Map to store unique Cell instances
const cellMap = new Map<string, Cell>();

// Function to retrieve or create unique Cell instances
const getCell: CellFlyweight["getCell"] = (i, j) => {
  const key = `${i}:${j}`;

  // Check if the cell already exists in the map
  if (!cellMap.has(key)) {
    // If not, create and store it in the map
    const newCell: Cell = { i, j };
    cellMap.set(key, newCell);
  }

  // Return the existing or newly created cell
  return cellMap.get(key)!;
};

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  const cell = getCell(i, j); // Retrieve the unique Cell instance

  // Generate a unique key for each cache based on its cell
  const cacheKey = `${cell.i}:${cell.j}`;

  // Initialize the cache's coin count only once if it doesn't already exist
  if (!cacheCoinsMap.has(cacheKey)) {
    const initialCoins = Math.floor(
      luck([cell.i, cell.j, "initialValue"].toString()) * 10,
    );
    cacheCoinsMap.set(cacheKey, initialCoins);
  }

  // Convert cell numbers into lat/lng bounds
  const origin = OAKES_CLASSROOM;
  const bounds = leaflet.latLngBounds([
    [
      origin.lat + cell.i * TILE_DEGREES,
      origin.lng + cell.j * TILE_DEGREES,
    ],
    [
      origin.lat + (cell.i + 1) * TILE_DEGREES,
      origin.lng + (cell.j + 1) * TILE_DEGREES,
    ],
  ]);

  // Add a rectangle to the map to represent the cache
  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // Add a tooltip to the rect that displays the cache's position in latitudes and longitudes
  rect.bindTooltip(
    `Cache at ${Math.floor(bounds.getCenter().lat * 10000)}, ${
      Math.ceil(bounds.getCenter().lng * 10000)
    }`,
  );

  // Handle interactions with the cache
  rect.bindPopup(() => {
    // Retrieve the current number of coins from the cache map
    let numCoins = cacheCoinsMap.get(cacheKey) || 0;

    // The popup offers a description and button
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
                <div>Cache ${bounds.getCenter().lat}:${bounds.getCenter().lng}.</div>
                <div>Has <span id="value">${numCoins}</span> coins.</div>
                <button id="collect">collect</button>
                <button id="deposit">deposit</button>`;

    // Clicking the button decrements the cache's value and increments the player's points
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        if (numCoins > 0) {
          numCoins--;
          cacheCoinsMap.set(cacheKey, numCoins); // Update the cache's coin count
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            numCoins.toString();
          coins++;
          inventory.innerHTML = `You have ${coins} coins`;
        }
      });
    // Add another button to deposit coins
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        if (coins > 0) {
          coins--;
          numCoins++;
          cacheCoinsMap.set(cacheKey, numCoins); // Update the cache's coin count
          popupDiv.querySelector<HTMLSpanElement>("#value")!.innerHTML =
            numCoins.toString();
          inventory.innerHTML = `You have ${coins} coins`;
        }
      });
    return popupDiv;
  });
}

// Example usage in the neighborhood spawning logic
for (let i = -NEIGHBORHOOD_SIZE; i <= NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j <= NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j, "spawn"].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
