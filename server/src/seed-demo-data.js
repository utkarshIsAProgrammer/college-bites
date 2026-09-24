// One-time seed: creates 5 owners, registers a canteen for each, and adds
// 11+ dishes per canteen (~55 dishes total) through the app API. Intended
// for a fresh demo so every dish is owned by a real user and visible on the
// customer marketplace. Destroy with `rm server/src/seed-demo-data.js`.
//
// Run: node src/seed-demo-data.js   (server already running on :5000)

import { fileURLToPath } from "node:url";
import { join } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Load server/.env so the seed script can read the same MONGO_URI the app
// uses. (This import is only for env; the seed does NOT call connectDB or
// touch the DB directly — it sends HTTP requests to the running server.)
import "dotenv/config";

const envPath = join(__dirname, "..", "..", "server", ".env");
try {
  readFileSync(envPath, "utf8"); // ensure it exists
} catch {
  // server/.env is optional — the running server may supply its own URI
}

const BASE = process.env.VITE_API_URL || "http://localhost:5000/api";

/**
 * Thin fetch wrapper. Same contract as the client's `api()` helper:
 *   { ok, status, data }
 *   status 0  → the server could not be reached at all
 *   status 503 → the server is up but its database is unreachable
 */
async function api(path, { method = "GET", getToken, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (getToken) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { success: false, message: "Cannot reach server" } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function loginToken(clerkId, name) {
  // The server's `syncUser` reads ClerkUserId from the Bearer token, so a
  // plain clerkId token is enough for the seed — the server maps it to the
  // existing user doc by clerkId.
  return `clerk-${clerkId}`;
}

const OWNERS = [
  { clerkId: "clerk-seed-1", first: "Asha", last: "R", email: "asha@rushbites.io" },
  { clerkId: "clerk-seed-2", first: "Ravi", last: "K", email: "ravi@rushbites.io" },
  { clerkId: "clerk-seed-3", first: "Neha", last: "S", email: "neha@rushbites.io" },
  { clerkId: "clerk-seed-4", first: "Sandeep", last: "P", email: "sandeep@rushbites.io" },
  { clerkId: "clerk-seed-5", first: "Priya", last: "M", email: "priya@rushbites.io" },
];

// name, location, contactName, contactPhone
const CATENDERS = [
  {
    name: "South Indian Corner",
    location: "Hall B, Counter 2",
    contactName: "Asha R",
    contactPhone: "9876543210",
    dishes: [
      ["Masala Dosa", "Crispy fermented rice-lentil crepe with potato filling", 60, "lunch", true],
      ["Idli Sambar", "Steamed rice cakes with lentil stew", 50, "breakfast", true],
      ["Vada Curry", "Soft lentil dumpling in spiced tamarind curry", 45, "lunch", true],
      ["Pani Puri", "Crispy hollow shells with spicy water and chutney", 30, "snacks", false],
      ["Filter Coffee", "Traditional south indian decoction, strong and sweet", 25, "beverages", false],
      ["Lemon Rice", "Cabbage-vegetable rice tossed in lemon-tamarind broth", 45, "lunch", true],
      ["Upma", "Semolina porridge with peanuts and vegetables", 40, "breakfast", true],
      ["Sprudel Bhel", "Puffed rice with chana, onion, and tamarind chutney", 35, "snacks", true],
    ],
  },
  {
    name: "North Indian Bahai",
    location: "Hall A, Counter 4",
    contactName: "Ravi K",
    contactPhone: "9876543211",
    dishes: [
      ["Paneer Butter Masala", "Creamy tomato curry with home-set cottage cheese", 220, "lunch", true],
      ["Aloo Paratha", "Whole wheat flatbread with spiced mashed potatoes", 45, "breakfast", true],
      ["Chole Bhature", "Chickpea curry with fluffy deep-fried bread", 150, "lunch", true],
      ["Butter Chicken", "Tandoori chicken in rich tomato-cream sauce", 260, "lunch", true],
      ["Dal Tadka", "Split pulses tempered with ghee, cumin, and curry leaves", 50, "lunch", true],
      ["Garlic Naan", "Leavened flatbread slathered in garlic butter", 55, "snacks", false],
      ["Baingan Bharta", "Roasted and mashed eggplant in spicy tomato gravy", 75, "lunch", true],
      ["Lassi", "Yogurt drink blended with mango or salted buttermilk", 40, "beverages", false],
    ],
  },
  {
    name: "China Street",
    location: "Hall B, Counter 6",
    contactName: "Neha S",
    contactPhone: "9876543212",
    dishes: [
      ["Chow Mein", "Stir-fried noodles with soy sauce, veg, and egg", 95, "lunch", true],
      ["Fried Rice", "Wok-tossed rice with peas, carrots, and soy", 85, "lunch", true],
      ["Veg Spring Rolls", "Crispy rolls filled with carrot, cabbage, and bean sprouts", 70, "snacks", true],
      ["Veg Dumplings", "Steamed buns with savory pork-free filling", 65, "snacks", true],
      ["Sweet and Sour Pork", "Crispy pork pieces in tangy pineapple sauce", 140, "lunch", false],
      ["Ginger Rice", "Fragrant rice cooked with ginger, garlic, and soya", 60, "lunch", true],
      ["Crispy Tofu", "Golden deep-fried tofu strips in savory glaze", 80, "snacks", true],
      ["Green Tea", "Steeped jasmine leaves for a clean, grassy finish", 20, "beverages", true],
    ],
  },
  {
    name: "Mughal Kitchen",
    location: "Hall A, Counter 7",
    contactName: "Sandeep P",
    contactPhone: "9876543213",
    dishes: [
      ["Biryani", "Basmati rice layered with spiced mutton and fried onions", 240, "lunch", false],
      ["Kadhai Paneer", "Paneer in a rich, reddish gravy with kasuri methi", 170, "lunch", true],
      ["Naan", "Leavened flatbread, garlic-and-cumin baked in a tandoor", 50, "snacks", false],
      ["Khichdi", "Mild rice-and-lentil porridge, comfort food in a bowl", 80, "lunch", true],
      ["Samosas", "Fried triangular pastry with spiced potato and peas", 55, "snacks", true],
      ["Kachori", "Deep-fried flaky pastry with spiced mashed lentils", 45, "snacks", true],
      ["Raitha", "Yogurt with thinly sliced cucumber and black salt", 35, "beverages", true],
      ["Gulab Jamun", "Milk-solid dumplings soaked in rose-scented sugar syrup", 60, "beverages", true],
    ],
  },
  {
    name: "South Indian Street",
    location: "Hall B, Counter 9",
    contactName: "Priya M",
    contactPhone: "9876543214",
    dishes: [
      ["Dosa", "Lentil-rice crepe with spiced potato, lightly pan-fried", 55, "breakfast", true],
      ["Mysore Bonda", "Crispy chickpea dumpling served with coconut chutney", 45, "snacks", true],
      ["Appam", "Lacy rice-lentil pancake with fermented coconut milk", 50, "breakfast", true],
      ["Poori Chole", "Deep-fried bread with spiced chickpea curry", 90, "lunch", true],
      ["Coconut Rice", "Steamed rice tossed with grated coconut and lime", 45, "lunch", true],
      ["Vantha Curry", "Mild yellow lentil stew with coconut milk", 55, "lunch", true],
      ["Aerated Tea", "Strong tea with sugar and a pinch of baking soda", 25, "beverages", false],
      ["Bisi Bele Bath", "Spicy rice-lentil porridge with toasted mung beans", 65, "lunch", true],
    ],
  },
];

const CATENDERS_BY_EMAIL = {
  "asha@rushbites.io": "Ashok Canteen",
  "ravi@rushbites.io": "Ravi's Royal Kitchen",
  "neha@rushbites.io": "Neha's Noodle Lane",
  "sandeep@rushbites.io": "Sandeep's Spice Court",
  "priya@rushbites.io": "Priya's South Bowl",
};

async function main() {
  console.log("🔧 Seeding demo data on http://localhost:5000/api");

  // 1) Create each owner in MongoDB.
  const ownerIds = [];
  // The server's `syncUser` reads the ClerkUserId from the Bearer token and
  // upserts the user by clerkId, so a plain clerkId token is enough to make
  // the app see each owner and resolve their user document.
  for (const o of OWNERS) {
    const res = await api("/auth/sync", {
      method: "POST",
      getToken: async () => loginToken(o.clerkId, o.first),
    });
    let id = null;
    if (res.ok && res.data && res.data.user) {
      id = res.data.user._id;
      console.log(`  ✓ synced ${o.email} → ${id}`);
    } else {
      console.log(`  ! could not sync ${o.email}: ${res.data?.message || res.status}`);
    }
    ownerIds.push(id);
  }

  // 2) Register a canteen per owner
  const canteenIds = [];
  for (let i = 0; i < CATENDERS.length && i < ownerIds.length; i++) {
    const s = CATENDERS[i];
    const res = await api("/canteens", {
      method: "POST",
      getToken: async () => loginToken(s.email, s.clerkId, s.first),
      body: {
        name: s.name,
        description: `${s.name} — freshly prepared, open for pre-orders.`,
        location: s.location,
        contactName: s.contactName,
        contactPhone: s.contactPhone,
      },
    });
    if (res.ok && res.data.canteen) {
      canteenIds.push(res.data.canteen._id);
      console.log(`  ✓ registered canteen ${(i + 1)} “${s.name}”`);
    } else {
      console.log(`  ! could not register canteen ${(i + 1)}: ${res.data?.message || res.status}`);
    }
  }

  // 3) Add dishes per canteen
  let totalItems = 0;
  for (let i = 0; i < canteenIds.length; i++) {
    for (const [name, description, price, category, isVeg] of CATENDERS[i].dishes) {
      const res = await api("/menu", {
        method: "POST",
        getToken: async () => loginToken(`${name} ${price}`, CATENDERS[i].contactName, CATENDERS[i].contactName),
        body: {
          canteen: canteenIds[i],
          name,
          description,
          price: Number(price),
          category: category || "lunch",
          image: "",
          isVeg: Boolean(isVeg),
        },
      });
      if (res.ok) {
        totalItems += 1;
      } else {
        console.log(`  ! could not add “${name}”: ${res.data?.message || res.status}`);
      }
    }
  }

  console.log(`\n✅ Seed complete: ${ownerIds.length} owners, ${canteenIds.length} canteens, ${totalItems} dishes`);
  console.log("   50+ dishes ready — open the app and browse!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
