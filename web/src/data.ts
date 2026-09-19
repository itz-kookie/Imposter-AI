export interface WordPack {
  category: string;
  word: string;
  fallback: string[];
  imposterFallback: string[];
}

export const WORDS: WordPack[] = [
  { category: "Food", word: "Pizza", fallback: ["Slice", "Oven", "Delivery", "Crust", "Triangle", "Box"], imposterFallback: ["Fresh", "Tasty", "Dinner"] },
  { category: "Places", word: "Airport", fallback: ["Gate", "Luggage", "Departure", "Passport", "Runway", "Terminal"], imposterFallback: ["Busy", "Travel", "Queue"] },
  { category: "Objects", word: "Umbrella", fallback: ["Forecast", "Fold", "Handle", "Puddle", "Drizzle", "Canopy"], imposterFallback: ["Useful", "Outside", "Carry"] },
  { category: "Animals", word: "Penguin", fallback: ["Tuxedo", "Waddle", "Iceberg", "Colony", "Flipper", "Pebble"], imposterFallback: ["Cold", "Cute", "Wild"] },
  { category: "Entertainment", word: "Piano", fallback: ["Keys", "Pedal", "Grand", "Bench", "Chord", "Octave"], imposterFallback: ["Sound", "Practice", "Stage"] },
  { category: "Nature", word: "Volcano", fallback: ["Dormant", "Crater", "Ash", "Pressure", "Magma", "Peak"], imposterFallback: ["Hot", "Danger", "Earth"] },
  { category: "Food", word: "Chocolate", fallback: ["Cocoa", "Wrapper", "Melt", "Bitter", "Truffle", "Bar"], imposterFallback: ["Sweet", "Treat", "Brown"] },
  { category: "Places", word: "Library", fallback: ["Whisper", "Shelves", "Borrow", "Catalogue", "Quiet", "Return"], imposterFallback: ["Public", "Study", "Building"] },
  { category: "Objects", word: "Camera", fallback: ["Focus", "Shutter", "Lens", "Memory", "Frame", "Flash"], imposterFallback: ["Travel", "Moment", "Device"] },
  { category: "Animals", word: "Octopus", fallback: ["Eight", "Ink", "Tentacle", "Reef", "Clever", "Suction"], imposterFallback: ["Ocean", "Strange", "Creature"] },
  { category: "Nature", word: "Rainbow", fallback: ["Prism", "Arc", "Seven", "Storm", "Spectrum", "Promise"], imposterFallback: ["Colour", "Sky", "Beautiful"] },
  { category: "Transport", word: "Bicycle", fallback: ["Pedal", "Chain", "Helmet", "Balance", "Spoke", "Bell"], imposterFallback: ["Road", "Exercise", "Wheels"] }
];

export const BOT_NAMES = ["Maya", "Leo", "Nora", "Sam", "Ivy", "Omar", "Zoe"];
export const COLORS = ["#ffc861", "#85d8ff", "#a58aff", "#ff8e88", "#71d6a3", "#ffb3da", "#ff9d63", "#9bd57d"];

