import React, { useState, useEffect, useRef, useCallback } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { ordersCollection, restaurantsCollection, menuItemsCollection } from "./firebase.js";
import {
  ArrowLeft,
  QrCode,
  Camera,
  ShoppingCart,
  Plus,
  Minus,
  CheckCircle2,
  Circle,
  LogOut,
  ShieldCheck,
  Store,
  RefreshCcw,
  Pencil,
  Trash2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* STATIC DEMO DATA                                                    */
/* ------------------------------------------------------------------ */

const THEATRE = "PVR Phoenix";
const AUDITORIUMS = ["Audi 1", "Audi 2", "Audi 3", "Audi 4", "Audi 5", "Audi 6"];
const SEAT_ROWS = ["A", "B", "C", "D", "E", "F"];
const SEAT_COLS = Array.from({ length: 10 }, (_, i) => i + 1);

// One QR per auditorium (not per seat) — this is what you'd actually
// print and stick up inside each hall. Scanning it fills in the
// auditorium automatically; the seat is always chosen manually by the
// customer on the next screen.
const DEMO_QRS = AUDITORIUMS.map((audi, i) => ({
  code: `AUD-PHX-${i + 1}`,
  label: `${audi} QR`,
  audi,
}));

// This is only used ONCE — the very first time the app runs, to fill
// the shared database with a starting point (so you don't open an
// empty app). After that, the real data lives in Firestore and gets
// edited from the Admin panel, not here.
const DEFAULT_RESTAURANTS = [
  {
    id: "burger-house",
    name: "Burger House",
    desc: "Burgers, fries & shakes",
    icon: "🍔",
    rating: 4.6,
    time: "20 min",
    menu: [
      { name: "Chocolate Shake", desc: "Thick creamy shake", price: 149, cat: "Bestsellers", icon: "🥤" },
      { name: "Classic Burger", desc: "Juicy veg patty, cheese & sauce", price: 199, cat: "Bestsellers", icon: "🍔" },
      { name: "Crispy Fries", desc: "Salted golden fries", price: 129, cat: "Bestsellers", icon: "🍟" },
      { name: "Burger House Combo", desc: "Chef's combo of the day", price: 449, cat: "More", icon: "🍱" },
    ],
  },
  {
    id: "pizza-corner",
    name: "Pizza Corner",
    desc: "Wood-fired pizzas & garlic bread",
    icon: "🍕",
    rating: 4.4,
    time: "25 min",
    menu: [
      { name: "Margherita Pizza", desc: "Classic tomato & mozzarella", price: 299, cat: "Bestsellers", icon: "🍕" },
      { name: "Farmhouse Pizza", desc: "Loaded with garden veggies", price: 349, cat: "Bestsellers", icon: "🍕" },
      { name: "Garlic Bread", desc: "Toasted with herb butter", price: 159, cat: "Bestsellers", icon: "🥖" },
      { name: "Pizza Corner Combo", desc: "Pizza + garlic bread + drink", price: 499, cat: "More", icon: "🍱" },
    ],
  },
  {
    id: "popcorn-express",
    name: "Popcorn Express",
    desc: "Popcorn, nachos & combos",
    icon: "🍿",
    rating: 4.7,
    time: "10 min",
    menu: [
      { name: "Large Popcorn", desc: "Salted, butter-tossed", price: 189, cat: "Bestsellers", icon: "🍿" },
      { name: "Cheesy Nachos", desc: "Loaded with jalapenos", price: 179, cat: "Bestsellers", icon: "🧀" },
      { name: "Classic Hot Dog", desc: "With mustard & ketchup", price: 159, cat: "Bestsellers", icon: "🌭" },
      { name: "Movie Night Combo", desc: "Popcorn + drink + nachos", price: 399, cat: "More", icon: "🍱" },
    ],
  },
  {
    id: "coffee-company",
    name: "Coffee Company",
    desc: "Coffee, cold brews & bakes",
    icon: "☕",
    rating: 4.5,
    time: "15 min",
    menu: [
      { name: "Cappuccino", desc: "Rich espresso & foamed milk", price: 169, cat: "Bestsellers", icon: "☕" },
      { name: "Cold Brew", desc: "Slow steeped, smooth finish", price: 189, cat: "Bestsellers", icon: "🧊" },
      { name: "Fudge Brownie", desc: "Warm & gooey", price: 149, cat: "Bestsellers", icon: "🍫" },
      { name: "Coffee + Bake Combo", desc: "Any coffee + any bake", price: 299, cat: "More", icon: "🍱" },
    ],
  },
];

const STATUS_STEPS = [
  "Payment received",
  "Waiting for restaurant",
  "Restaurant confirmed",
  "Food being prepared",
  "Food ready",
  "Delivering to your seat",
  "Delivered",
];

const RESTAURANT_PASSWORD = "1234";
const ADMIN_PASSWORD = "admin123";

// TODO: Replace this with YOUR real Razorpay Key ID before going live.
// Find it at: Razorpay Dashboard -> Settings -> API Keys.
// Keys starting with "rzp_test_" are safe to use while testing (no real
// money moves). Keys starting with "rzp_live_" charge real cards/UPI.
const RAZORPAY_KEY_ID = "rzp_test_TV3wGzqWJmhYXE";

/* ------------------------------------------------------------------ */
/* SHARED DATABASE HELPERS (Firebase Firestore)                        */
/* ------------------------------------------------------------------ */
// Every order lives in one shared online database now. A customer's
// phone, a restaurant's phone, and the admin's phone all read and write
// the SAME data — so a new order shows up everywhere within a second,
// with no manual refreshing needed.

async function createOrder(order) {
  try {
    await setDoc(doc(ordersCollection, order.id), order);
    return true;
  } catch (err) {
    console.error("Could not save order:", err);
    return false;
  }
}

async function updateOrderStatus(orderId, statusIndex) {
  try {
    await updateDoc(doc(ordersCollection, orderId), { statusIndex });
    return true;
  } catch (err) {
    console.error("Could not update order:", err);
    return false;
  }
}

async function saveOrderRating(orderId, stars) {
  try {
    await updateDoc(doc(ordersCollection, orderId), { customerRating: stars });
    return true;
  } catch (err) {
    console.error("Could not save rating:", err);
    return false;
  }
}

async function deleteAllOrders(orders) {
  try {
    await Promise.all(orders.map((o) => deleteDoc(doc(ordersCollection, o.id))));
    return true;
  } catch (err) {
    console.error("Could not reset orders:", err);
    return false;
  }
}

// Live-subscribes to every order, newest first. Calls onChange every
// time ANYTHING changes, on any device. Returns a function to call when
// the screen closes, to stop listening.
function subscribeToAllOrders(onChange) {
  const q = query(ordersCollection, orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data()));
  });
}

// Live-subscribes to a single order by id (used by the customer's order
// status screen, which only needs to watch its own order).
function subscribeToOrder(orderId, onChange) {
  return onSnapshot(doc(ordersCollection, orderId), (snap) => {
    if (snap.exists()) onChange(snap.data());
  });
}

function shortId() {
  return "FOOD-" + Math.floor(10000 + Math.random() * 89999);
}

/* ------------------------------------------------------------------ */
/* RESTAURANTS & MENU — shared database (Firebase Firestore)           */
/* ------------------------------------------------------------------ */
// Same pattern as orders: every restaurant and menu item is its own
// document in Firestore. Editing them from the Admin panel updates
// this shared data live for every customer — no code changes, no
// redeploying, no waiting for GitHub/Render.

function subscribeToRestaurants(onChange) {
  return onSnapshot(restaurantsCollection, (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data()));
  });
}

function subscribeToMenuItems(onChange) {
  return onSnapshot(menuItemsCollection, (snapshot) => {
    onChange(snapshot.docs.map((d) => d.data()));
  });
}

async function saveRestaurant(restaurant) {
  await setDoc(doc(restaurantsCollection, restaurant.id), restaurant);
}

async function deleteRestaurant(restaurantId, itsMenuItems) {
  await deleteDoc(doc(restaurantsCollection, restaurantId));
  // Clean up its menu items too, so nothing orphaned is left behind.
  await Promise.all(itsMenuItems.map((m) => deleteDoc(doc(menuItemsCollection, m.id))));
}

async function saveMenuItem(item) {
  await setDoc(doc(menuItemsCollection, item.id), item);
}

async function deleteMenuItem(itemId) {
  await deleteDoc(doc(menuItemsCollection, itemId));
}

// Runs once, automatically, the first time anyone opens the app on a
// brand-new database. If restaurants already exist (real data has been
// added), this does nothing — it will never overwrite or duplicate
// anything you've already set up.
async function seedDefaultRestaurantsIfEmpty() {
  const existing = await getDocs(restaurantsCollection);
  if (!existing.empty) return;

  for (const r of DEFAULT_RESTAURANTS) {
    const restaurantId = newOrderId();
    await setDoc(doc(restaurantsCollection, restaurantId), {
      id: restaurantId,
      name: r.name,
      desc: r.desc,
      icon: r.icon,
      rating: r.rating,
      time: r.time,
    });
    for (const item of r.menu) {
      const itemId = newOrderId();
      await setDoc(doc(menuItemsCollection, itemId), { id: itemId, restaurantId, ...item });
    }
  }
}

function newOrderId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return "ord-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function money(n) {
  return "₹" + n.toLocaleString("en-IN");
}

// Plays a short two-note "ding" using the browser's own audio tools —
// no sound file needed. Used to alert restaurant/admin staff the
// instant a new order arrives, without them needing to be looking at
// the screen.
function playNewOrderChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.3, now + i * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.35);
    });
  } catch {
    // Some browsers block audio until the person has tapped something
    // on the page first — fail silently rather than break the screen.
  }
}

// Watches a list of order ids. The moment an id shows up that wasn't
// there on the previous check (a genuinely NEW order — not just an
// existing one changing status), it plays the chime, flashes the
// browser tab's title for a few seconds, and returns true briefly so
// the screen can show an on-screen banner too.
function useNewOrderAlert(orderIds) {
  const prevRef = useRef(null);
  const [banner, setBanner] = useState(false);
  const originalTitleRef = useRef(document.title);
  const key = orderIds.join(",");

  useEffect(() => {
    const current = new Set(orderIds);
    if (prevRef.current !== null) {
      const hasNew = [...current].some((id) => !prevRef.current.has(id));
      if (hasNew) {
        playNewOrderChime();
        setBanner(true);
        const bannerTimer = setTimeout(() => setBanner(false), 5000);

        let flashes = 0;
        const flashTimer = setInterval(() => {
          document.title = flashes % 2 === 0 ? "🔔 New order! — SeatBite" : originalTitleRef.current;
          flashes += 1;
          if (flashes > 6) {
            clearInterval(flashTimer);
            document.title = originalTitleRef.current;
          }
        }, 700);

        prevRef.current = current;
        return () => {
          clearTimeout(bannerTimer);
          clearInterval(flashTimer);
        };
      }
    }
    prevRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return banner;
}

// The camera might scan a full link (like https://.../q/AUD-PHX-4)
// or just the plain code text (like AUD-PHX-4). This pulls the
// code out either way so both kinds of printed QR codes work.
function extractCode(scannedText) {
  const text = scannedText.trim();
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const qIndex = parts.indexOf("q");
    if (qIndex !== -1 && parts[qIndex + 1]) {
      return decodeURIComponent(parts[qIndex + 1]).toUpperCase();
    }
  } catch {
    // not a URL — fall through and treat it as a plain code
  }
  return text.toUpperCase();
}

/* ------------------------------------------------------------------ */
/* SHARED UI BITS                                                      */
/* ------------------------------------------------------------------ */

function Shell({ children }) {
  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex justify-center">
      <div className="w-full max-w-sm min-h-screen bg-neutral-950 flex flex-col">{children}</div>
    </div>
  );
}

function TopBar({ tag, right, onBack }) {
  return (
    <div className="flex items-center justify-between px-5 pt-6 pb-4">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="mr-1 -ml-1 p-1 text-neutral-400 hover:text-amber-400 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div>
          <div className="text-amber-500 text-xs font-bold tracking-[0.25em]">SEATBITE</div>
        </div>
      </div>
      {right && <div className="text-right text-xs text-neutral-400 leading-tight">{right}</div>}
      {tag}
    </div>
  );
}

function SeatTag({ session }) {
  if (!session) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-neutral-200">{THEATRE}</div>
      <div className="text-xs text-neutral-500">
        {session.audi}
        {session.seat ? ` · Seat ${session.seat}` : ""}
      </div>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-950 font-semibold rounded-xl py-3.5 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

function CameraScanner({ onResult, onBack }) {
  const [error, setError] = useState("");
  const scannerRef = useRef(null);

  useEffect(() => {
    // Html5QrcodeScanner draws its own camera view + permission prompt
    // into the div with id="qr-reader" below.
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 240, height: 240 }, rememberLastUsedCamera: true },
      false
    );
    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        scanner.clear().catch(() => {});
        onResult(extractCode(decodedText));
      },
      () => {
        // fires continuously while no QR is found in frame — ignore
      }
    );

    return () => {
      scannerRef.current?.clear().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell>
      <TopBar onBack={onBack} />
      <div className="px-5 pb-6 flex-1">
        <h2 className="text-lg font-bold mb-1">Scan the seat QR</h2>
        <p className="text-xs text-neutral-500 mb-4">
          Point your camera at the QR code on your seat, then allow camera access if asked.
        </p>
        <div id="qr-reader" className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900" />
        {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
        <p className="text-[11px] text-neutral-600 mt-4">
          Camera access needs a secure (https) link — this works once the site is live on
          Render/Vercel, but not on a plain http address.
        </p>
      </div>
    </Shell>
  );
}

function Card({ children, onClick, className = "" }) {
  return (
    <div
      onClick={onClick}
      className={`bg-neutral-900 border border-neutral-800 rounded-xl ${
        onClick ? "cursor-pointer hover:border-amber-500/50 active:scale-[0.99]" : ""
      } transition-all ${className}`}
    >
      {children}
    </div>
  );
}

// Shows how long ago an order came in, updating every 30 seconds, and
// turns red once it's been waiting 10+ minutes — a quick visual flag
// for staff when several orders are queued up at once.
function ElapsedTime({ since }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.max(0, Math.round((Date.now() - since) / 60000));
  const label = mins < 1 ? "just now" : `${mins} min ago`;
  return <span className={mins >= 10 ? "text-red-400 font-semibold" : "text-neutral-500"}>{label}</span>;
}

/* ------------------------------------------------------------------ */
/* CUSTOMER: LANDING / SCAN                                             */
/* ------------------------------------------------------------------ */

function Landing({ onEnter, goScan, goRestaurantLogin, goAdminLogin }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const tryOpen = (raw) => {
    const c = raw.trim().toUpperCase();
    const found = DEMO_QRS.find((q) => q.code === c);
    if (!found) {
      setError("That code doesn't match a seat in this theatre. Try one of the demo codes below.");
      return;
    }
    setError("");
    onEnter(found);
  };

  return (
    <Shell>
      <div className="px-6 pt-10 pb-6 text-center">
        <div className="text-amber-500 text-xs font-bold tracking-[0.3em] mb-3">SEATBITE</div>
        <h1 className="text-3xl font-black leading-tight uppercase tracking-tight">
          Food delivered to
          <br />
          your theatre seat
        </h1>
        <p className="text-neutral-400 text-sm mt-3">
          Scan the QR on your seat. Choose a food partner, pay online, and keep watching.
        </p>
      </div>

      <div className="px-5">
        <button
          onClick={goScan}
          className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold rounded-xl py-3.5 mb-3 flex items-center justify-center gap-2"
        >
          <Camera size={18} />
          Scan QR with camera
        </button>

        <Card className="p-4 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <QrCode size={16} className="text-amber-500" />
            <span className="text-sm font-semibold">Have a QR code?</span>
          </div>
          <p className="text-xs text-neutral-500 mb-3">Enter the code printed under the QR on your seat.</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryOpen(code)}
              placeholder="AUD-PHX-4"
              className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm placeholder-neutral-600 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => tryOpen(code)}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold text-sm rounded-lg px-4"
            >
              Open
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </Card>
      </div>

      <div className="mt-auto px-5 py-6 flex items-center justify-center gap-4 text-xs text-neutral-500">
        <button onClick={goRestaurantLogin} className="hover:text-amber-400 underline underline-offset-2">
          Restaurant login
        </button>
        <span>·</span>
        <button onClick={goAdminLogin} className="hover:text-amber-400 underline underline-offset-2">
          Admin login
        </button>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* CUSTOMER: PICK AUDI / SEAT (for QR codes missing that info)         */
/* ------------------------------------------------------------------ */

function PickAuditSeat({ initial, onDone, onBack }) {
  const [audi, setAudi] = useState(initial.audi || null);
  const [seat, setSeat] = useState(initial.seat || null);

  const needAudi = !initial.audi;
  const needSeat = !initial.seat;

  return (
    <Shell>
      <TopBar onBack={onBack} right={<SeatTag session={{ audi: audi || "Choose auditorium", seat }} />} />
      <div className="px-5 pb-6 flex-1">
        {needAudi && !audi && (
          <>
            <h2 className="text-lg font-bold mb-1">Which auditorium?</h2>
            <p className="text-xs text-neutral-500 mb-4">{THEATRE}</p>
            <div className="grid grid-cols-2 gap-2">
              {AUDITORIUMS.map((a) => (
                <Card key={a} onClick={() => setAudi(a)} className="p-4 text-center font-semibold text-sm">
                  {a}
                </Card>
              ))}
            </div>
          </>
        )}

        {audi && needSeat && !seat && (
          <>
            <h2 className="text-lg font-bold mb-1">Pick your seat</h2>
            <p className="text-xs text-neutral-500 mb-4">
              {THEATRE} · {audi}
            </p>
            <div className="flex flex-col gap-2">
              {SEAT_ROWS.map((row) => (
                <div key={row} className="flex items-center gap-1.5">
                  <span className="w-4 text-xs text-neutral-500 font-semibold">{row}</span>
                  <div className="grid grid-cols-10 gap-1 flex-1">
                    {SEAT_COLS.map((col) => (
                      <button
                        key={col}
                        onClick={() => setSeat(`${row}${col}`)}
                        className="aspect-square rounded bg-neutral-900 border border-neutral-800 hover:border-amber-500 hover:bg-amber-500/10 text-[10px] text-neutral-400 flex items-center justify-center transition-colors"
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {audi && seat && (
          <div className="pt-10 text-center">
            <CheckCircle2 className="mx-auto text-amber-500 mb-3" size={40} />
            <h2 className="text-lg font-bold">Seat & auditorium confirmed</h2>
            <p className="text-sm text-neutral-400 mt-1">
              {THEATRE} · {audi} · Seat {seat}
            </p>
            <PrimaryButton className="mt-8" onClick={() => onDone({ audi, seat })}>
              Continue to restaurants
            </PrimaryButton>
          </div>
        )}
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* CUSTOMER: RESTAURANT LIST                                            */
/* ------------------------------------------------------------------ */

function RestaurantList({ session, restaurants, onPick, onBack }) {
  return (
    <Shell>
      <TopBar onBack={onBack} right={<SeatTag session={session} />} />
      <div className="px-5 pb-6">
        <h2 className="text-xs font-semibold tracking-widest text-neutral-500 mb-3">CHOOSE A FOOD PARTNER</h2>
        {restaurants.length === 0 && <p className="text-sm text-neutral-600 py-6">Loading restaurants…</p>}
        <div className="flex flex-col gap-2">
          {restaurants.map((r) => (
            <Card key={r.id} onClick={() => onPick(r)} className="p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-neutral-800 flex items-center justify-center text-xl shrink-0">
                {r.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{r.name}</div>
                <div className="text-xs text-neutral-500 truncate">{r.desc}</div>
              </div>
              <div className="text-right text-xs shrink-0">
                <div className="text-amber-500 font-semibold">★ {r.rating}</div>
                <div className="text-neutral-500">{r.time}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* CUSTOMER: MENU + CART BUILD                                          */
/* ------------------------------------------------------------------ */

function Menu({ session, restaurant, menuItems, cart, setCart, onBack, onViewCart }) {
  const qty = (id) => cart[id]?.qty || 0;
  const change = (item, delta) => {
    setCart((prev) => {
      const current = prev[item.id]?.qty || 0;
      const next = Math.max(0, current + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[item.id];
      else copy[item.id] = { ...item, qty: next };
      return copy;
    });
  };

  const categories = [...new Set(menuItems.map((m) => m.cat))];
  const count = Object.values(cart).reduce((s, i) => s + i.qty, 0);
  const total = Object.values(cart).reduce((s, i) => s + i.qty * i.price, 0);

  return (
    <Shell>
      <TopBar onBack={onBack} right={<SeatTag session={session} />} />
      <div className="px-5 pb-28 flex-1">
        <Card className="p-4 mb-5 flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg bg-neutral-800 flex items-center justify-center text-xl">
            {restaurant.icon}
          </div>
          <div>
            <div className="font-bold uppercase tracking-tight">{restaurant.name}</div>
            <div className="text-xs text-neutral-500">
              ★ {restaurant.rating} · {restaurant.time} delivery
            </div>
          </div>
        </Card>

        {menuItems.length === 0 && <p className="text-sm text-neutral-600 py-6">Loading menu…</p>}

        {categories.map((cat) => (
          <div key={cat} className="mb-5">
            <h3 className="text-xs font-semibold tracking-widest text-neutral-500 mb-2">{cat.toUpperCase()}</h3>
            <div className="flex flex-col gap-2">
              {menuItems
                .filter((m) => m.cat === cat)
                .map((item) => (
                  <Card key={item.id} className="p-3.5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center text-lg shrink-0">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{item.name}</div>
                      <div className="text-xs text-neutral-500 truncate">{item.desc}</div>
                      <div className="text-xs text-amber-500 font-semibold mt-0.5">{money(item.price)}</div>
                    </div>
                    {qty(item.id) === 0 ? (
                      <button
                        onClick={() => change(item, 1)}
                        className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center justify-center shrink-0"
                      >
                        <Plus size={16} />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => change(item, -1)}
                          className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-4 text-center text-sm font-semibold">{qty(item.id)}</span>
                        <button
                          onClick={() => change(item, 1)}
                          className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center justify-center"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
            </div>
          </div>
        ))}
      </div>

      {count > 0 && (
        <div className="fixed bottom-0 w-full max-w-sm px-5 py-4 bg-neutral-950/95 backdrop-blur border-t border-neutral-800">
          <button
            onClick={onViewCart}
            className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold rounded-xl py-3.5 flex items-center justify-between px-5"
          >
            <span className="flex items-center gap-2 text-sm">
              <ShoppingCart size={16} />
              {count} · {money(total)}
            </span>
            <span className="text-sm">View cart →</span>
          </button>
        </div>
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* CUSTOMER: CART / PAY                                                 */
/* ------------------------------------------------------------------ */

function CartScreen({ session, restaurant, cart, onBack, onPaid }) {
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const items = Object.values(cart);
  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  const finalizeOrder = async (paymentId) => {
    const order = {
      id: newOrderId(),
      shortId: shortId(),
      theatre: THEATRE,
      audi: session.audi,
      seat: session.seat,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      items: items.map((i) => ({ name: i.name, price: i.price, qty: i.qty })),
      total,
      statusIndex: 1,
      createdAt: Date.now(),
      paymentId: paymentId || null,
    };
    await createOrder(order);
    setPaying(false);
    onPaid(order);
  };

  const pay = () => {
    setPayError("");

    if (!window.Razorpay) {
      setPayError("Payment system is still loading — wait a second and try again.");
      return;
    }
    if (RAZORPAY_KEY_ID.includes("REPLACE_WITH_YOUR_KEY")) {
      setPayError(
        "Payment isn't set up yet — add your real Razorpay Key ID in the code before taking real orders."
      );
      return;
    }

    setPaying(true);
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY_ID,
      amount: Math.round(total * 100), // Razorpay expects the amount in paise
      currency: "INR",
      name: "SeatBite",
      description: `${restaurant.name} · ${session.audi} · Seat ${session.seat}`,
      handler: (response) => finalizeOrder(response.razorpay_payment_id),
      modal: { ondismiss: () => setPaying(false) },
      theme: { color: "#f59e0b" },
    });
    rzp.on("payment.failed", (response) => {
      setPaying(false);
      setPayError("Payment failed: " + response.error.description);
    });
    rzp.open();
  };

  return (
    <Shell>
      <TopBar onBack={onBack} right={<SeatTag session={session} />} />
      <div className="px-5 pb-6 flex-1">
        <h2 className="text-2xl font-black uppercase tracking-tight mb-4">Your cart</h2>

        <Card className="p-4 mb-4">
          <div className="text-xs text-neutral-500 mb-1">DELIVER TO</div>
          <div className="text-sm font-semibold">{THEATRE}</div>
          <div className="text-xs text-neutral-500">
            {session.audi} · Seat {session.seat}
          </div>
        </Card>

        <Card className="mb-4 divide-y divide-neutral-800">
          {items.map((i) => (
            <div key={i.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{i.name}</div>
                <div className="text-xs text-neutral-500">
                  {money(i.price)} × {i.qty}
                </div>
              </div>
              <div className="text-sm font-semibold">{money(i.price * i.qty)}</div>
            </div>
          ))}
        </Card>

        <Card className="p-4 mb-6 flex items-center justify-between">
          <span className="text-sm text-neutral-400">Total</span>
          <span className="text-lg font-bold">{money(total)}</span>
        </Card>

        <PrimaryButton onClick={pay} disabled={paying}>
          {paying ? "Waiting for payment…" : `Pay ${money(total)}`}
        </PrimaryButton>
        {payError && <p className="text-xs text-red-400 text-center mt-3">{payError}</p>}
        <p className="text-[11px] text-neutral-600 text-center mt-3">
          Secure checkout powered by Razorpay.
        </p>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* CUSTOMER: ORDER STATUS (live-polls storage)                          */
/* ------------------------------------------------------------------ */

function RatingPopup({ order, restaurant, onClose }) {
  const [stars, setStars] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const pickStars = async (n) => {
    setStars(n);
    setSubmitted(true);
    await saveOrderRating(order.id, n);
  };

  const finish = () => {
    localStorage.setItem(`seatbite_rated_${order.id}`, "1");
    onClose();
  };

  const openGoogleReview = () => {
    if (restaurant?.googleReviewLink) window.open(restaurant.googleReviewLink, "_blank");
    finish();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
      <Card className="p-5 w-full max-w-xs relative">
        <button onClick={finish} className="absolute top-3 right-3 text-neutral-500 hover:text-neutral-300 text-sm">
          ✕
        </button>

        {!submitted ? (
          <>
            <h3 className="text-base font-bold mb-1">How was your order?</h3>
            <p className="text-xs text-neutral-500 mb-4">{order.restaurantName}</p>
            <div className="flex justify-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => pickStars(n)} className="text-3xl leading-none">
                  {n <= stars ? "⭐" : "☆"}
                </button>
              ))}
            </div>
          </>
        ) : stars >= 4 && restaurant?.googleReviewLink ? (
          <>
            <h3 className="text-base font-bold mb-1">Awesome, thank you! 🎉</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Mind sharing that on Google too? It really helps {order.restaurantName}.
            </p>
            <PrimaryButton onClick={openGoogleReview}>Rate on Google</PrimaryButton>
            <button onClick={finish} className="w-full text-center text-xs text-neutral-500 mt-3">
              No thanks
            </button>
          </>
        ) : (
          <>
            <h3 className="text-base font-bold mb-1">Thanks for letting us know</h3>
            <p className="text-xs text-neutral-400 mb-4">Your feedback goes straight to {order.restaurantName}.</p>
            <PrimaryButton onClick={finish}>Close</PrimaryButton>
          </>
        )}
      </Card>
    </div>
  );
}

function OrderStatus({ orderId, restaurants, onNewOrder }) {
  const [order, setOrder] = useState(null);
  const [popupDismissed, setPopupDismissed] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToOrder(orderId, setOrder);
    return () => unsubscribe();
  }, [orderId]);

  if (!order) {
    return (
      <Shell>
        <TopBar />
        <div className="px-5 text-sm text-neutral-500">Loading order…</div>
      </Shell>
    );
  }

  const isDelivered = order.statusIndex === STATUS_STEPS.length - 1;
  const alreadyHandled = localStorage.getItem(`seatbite_rated_${order.id}`);
  const showRatingPopup = isDelivered && !alreadyHandled && !popupDismissed;
  const restaurant = restaurants?.find((r) => r.id === order.restaurantId);

  return (
    <Shell>
      {showRatingPopup && (
        <RatingPopup order={order} restaurant={restaurant} onClose={() => setPopupDismissed(true)} />
      )}
      <TopBar right={<span className="text-neutral-500">#{order.shortId}</span>} />
      <div className="px-5 pb-10 flex-1">
        <Card className="p-4 mb-4">
          <div className="text-xl font-black uppercase tracking-tight mb-1">Order confirmed</div>
          <div className="text-sm text-neutral-400 mb-3">{order.restaurantName}</div>
          <div className="flex gap-2">
            <span className="bg-neutral-800 rounded-lg px-3 py-1.5 text-xs">
              <div className="text-neutral-500">Theatre</div>
              <div className="font-semibold">{order.theatre}</div>
            </span>
            <span className="bg-neutral-800 rounded-lg px-3 py-1.5 text-xs">
              <div className="text-neutral-500">Audi</div>
              <div className="font-semibold">{order.audi}</div>
            </span>
            <span className="bg-neutral-800 rounded-lg px-3 py-1.5 text-xs">
              <div className="text-neutral-500">Seat</div>
              <div className="font-semibold">{order.seat}</div>
            </span>
          </div>
        </Card>

        <Card className="p-4 mb-4">
          <div className="text-xs font-semibold tracking-widest text-neutral-500 mb-3">STATUS</div>
          <div className="flex flex-col gap-3">
            {STATUS_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                {i <= order.statusIndex ? (
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                ) : (
                  <Circle size={18} className="text-neutral-700 shrink-0" />
                )}
                <span className={`text-sm ${i <= order.statusIndex ? "text-neutral-100" : "text-neutral-600"}`}>
                  {s}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 mb-6">
          <div className="text-xs font-semibold tracking-widest text-neutral-500 mb-3">ITEMS</div>
          <div className="flex flex-col gap-2 mb-3">
            {order.items.map((i) => (
              <div key={i.name} className="flex items-center justify-between text-sm">
                <span className="text-neutral-300">
                  {i.qty} × {i.name}
                </span>
                <span>{money(i.price * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-neutral-800 pt-3 flex items-center justify-between font-semibold">
            <span>Total paid</span>
            <span>{money(order.total)}</span>
          </div>
        </Card>

        <button
          onClick={onNewOrder}
          className="w-full text-center text-sm text-amber-500 hover:text-amber-400 underline underline-offset-2"
        >
          Start a new order
        </button>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* RESTAURANT STAFF                                                     */
/* ------------------------------------------------------------------ */

function RestaurantLogin({ restaurants, onBack, onLogin }) {
  const [restId, setRestId] = useState(restaurants[0]?.id || "");
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!restId && restaurants[0]) setRestId(restaurants[0].id);
  }, [restaurants, restId]);

  const submit = () => {
    if (pw !== RESTAURANT_PASSWORD) {
      setError("Wrong password. Hint: this demo uses 1234.");
      return;
    }
    onLogin(restId);
  };

  return (
    <Shell>
      <TopBar onBack={onBack} />
      <div className="px-5 pb-6 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Store size={18} className="text-amber-500" />
          <h2 className="text-lg font-bold">Restaurant login</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-6">Sign in to manage incoming orders.</p>

        <label className="text-xs text-neutral-500 mb-1 block">Restaurant</label>
        <select
          value={restId}
          onChange={(e) => setRestId(e.target.value)}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-amber-500"
        >
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <label className="text-xs text-neutral-500 mb-1 block">Password</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Demo password: 1234"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm mb-2 placeholder-neutral-600 focus:outline-none focus:border-amber-500"
        />
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        <PrimaryButton className="mt-4" onClick={submit}>
          Sign in
        </PrimaryButton>
      </div>
    </Shell>
  );
}

// Opens a clean, printable kitchen ticket for one order and sends it to
// the browser's normal print dialog — works with any printer already
// connected to the device, completely independent of whatever billing
// software the restaurant uses at the counter.
function printOrderTicket(order) {
  const win = window.open("", "_blank", "width=380,height=600");
  if (!win) return; // popup blocked — nothing we can do without a user click retry

  const itemRows = order.items
    .map(
      (i) => `<tr><td>${i.qty} x ${i.name}</td><td style="text-align:right">₹${i.price * i.qty}</td></tr>`
    )
    .join("");

  win.document.write(`
    <html>
      <head>
        <title>Order #${order.shortId}</title>
        <style>
          body { font-family: monospace; padding: 16px; font-size: 14px; color: #000; }
          h1 { font-size: 16px; margin: 0 0 4px; }
          .muted { color: #444; font-size: 12px; margin-bottom: 12px; }
          hr { border: none; border-top: 1px dashed #000; margin: 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 3px 0; font-size: 13px; }
          .total { font-weight: bold; font-size: 15px; }
        </style>
      </head>
      <body>
        <h1>SEATBITE — ${order.restaurantName}</h1>
        <div class="muted">
          #${order.shortId}<br/>
          ${order.theatre} · ${order.audi} · Seat ${order.seat}
        </div>
        <hr/>
        <table>${itemRows}</table>
        <hr/>
        <table><tr><td class="total">TOTAL</td><td class="total" style="text-align:right">₹${order.total}</td></tr></table>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function RestaurantDashboard({ restId, restaurants, onLogout }) {
  const restaurant = restaurants.find((r) => r.id === restId);
  const [allOrders, setAllOrders] = useState([]);
  const [tab, setTab] = useState("active");

  useEffect(() => {
    const unsubscribe = subscribeToAllOrders(setAllOrders);
    return () => unsubscribe();
  }, []);

  const orders = allOrders.filter((o) => o.restaurantId === restId);
  const showNewOrderBanner = useNewOrderAlert(orders.map((o) => o.id));

  const advance = async (orderId, currentStatusIndex) => {
    await updateOrderStatus(orderId, Math.min(currentStatusIndex + 1, STATUS_STEPS.length - 1));
  };

  // Oldest order first in the Active list — this is what a kitchen
  // actually needs: work through orders in the order they arrived, so
  // the first customer never gets forgotten under newer ones. Delivered
  // orders stay newest-first, since that's just a history log to skim.
  const active = orders
    .filter((o) => o.statusIndex < STATUS_STEPS.length - 1)
    .sort((a, b) => a.createdAt - b.createdAt);
  const done = orders
    .filter((o) => o.statusIndex === STATUS_STEPS.length - 1)
    .sort((a, b) => b.createdAt - a.createdAt);
  const shown = tab === "active" ? active : done;

  return (
    <Shell>
      <TopBar
        right={
          <button onClick={onLogout} className="text-neutral-500 hover:text-amber-400 flex items-center gap-1 text-xs">
            <LogOut size={14} /> Log out
          </button>
        }
      />
      <div className="px-5 pb-6 flex-1">
        {!restaurant && <p className="text-sm text-neutral-600 py-6">Loading restaurant…</p>}
        {restaurant && (
          <>
            {showNewOrderBanner && (
              <div className="bg-emerald-500 text-neutral-950 text-sm font-semibold rounded-xl px-4 py-3 mb-4 text-center animate-pulse">
                🔔 New order just came in!
              </div>
            )}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{restaurant.icon}</span>
              <h2 className="text-lg font-bold">{restaurant.name}</h2>
            </div>
            <p className="text-xs text-neutral-500 mb-4">Orders update live as customers pay.</p>
          </>
        )}

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("active")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              tab === "active" ? "bg-amber-500 text-neutral-950" : "bg-neutral-900 text-neutral-400 border border-neutral-800"
            }`}
          >
            Active ({active.length})
          </button>
          <button
            onClick={() => setTab("done")}
            className={`flex-1 rounded-lg py-2 text-xs font-semibold ${
              tab === "done" ? "bg-amber-500 text-neutral-950" : "bg-neutral-900 text-neutral-400 border border-neutral-800"
            }`}
          >
            Delivered ({done.length})
          </button>
        </div>

        {shown.length === 0 && (
          <p className="text-sm text-neutral-600 text-center py-10">No orders here yet.</p>
        )}

        <div className="flex flex-col gap-3">
          {shown.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-neutral-500">#{o.shortId}</span>
                <span className="text-xs text-neutral-500">
                  {o.audi} · Seat {o.seat}
                </span>
              </div>
              <div className="flex flex-col gap-1 mb-3">
                {o.items.map((i) => (
                  <div key={i.name} className="text-sm flex justify-between">
                    <span>
                      {i.qty} × {i.name}
                    </span>
                    <span className="text-neutral-400">{money(i.price * i.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-amber-500 font-semibold">{STATUS_STEPS[o.statusIndex]}</span>
                <span className="text-xs">
                  <ElapsedTime since={o.createdAt} />
                </span>
              </div>
              <div className="flex gap-2">
                {o.statusIndex < STATUS_STEPS.length - 1 ? (
                  <button
                    onClick={() => advance(o.id, o.statusIndex)}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-sm font-semibold rounded-lg py-2"
                  >
                    Mark as: {STATUS_STEPS[o.statusIndex + 1]}
                  </button>
                ) : (
                  <div className="flex-1 text-center text-emerald-500 text-sm font-semibold py-1">Delivered ✓</div>
                )}
                <button
                  onClick={() => printOrderTicket(o)}
                  className="shrink-0 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-semibold rounded-lg px-3"
                  title="Print kitchen ticket"
                >
                  🖨️
                </button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* ADMIN                                                                */
/* ------------------------------------------------------------------ */

function AdminLogin({ onBack, onLogin }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (pw !== ADMIN_PASSWORD) {
      setError("Wrong password. Hint: this demo uses admin123.");
      return;
    }
    onLogin();
  };

  return (
    <Shell>
      <TopBar onBack={onBack} />
      <div className="px-5 pb-6 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-amber-500" />
          <h2 className="text-lg font-bold">Admin login</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-6">Monitor every order across every restaurant.</p>

        <label className="text-xs text-neutral-500 mb-1 block">Password</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Demo password: admin123"
          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2.5 text-sm mb-2 placeholder-neutral-600 focus:outline-none focus:border-amber-500"
        />
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        <PrimaryButton className="mt-4" onClick={submit}>
          Sign in
        </PrimaryButton>
      </div>
    </Shell>
  );
}

function RestaurantForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.desc || "");
  const [icon, setIcon] = useState(initial?.icon || "🍽️");
  const [rating, setRating] = useState(initial?.rating ?? 4.5);
  const [time, setTime] = useState(initial?.time || "20 min");
  const [googleReviewLink, setGoogleReviewLink] = useState(initial?.googleReviewLink || "");

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: initial?.id || newOrderId(),
      name: name.trim(),
      desc: desc.trim(),
      icon: icon.trim() || "🍽️",
      rating: Number(rating) || 0,
      time: time.trim() || "20 min",
      googleReviewLink: googleReviewLink.trim(),
    });
  };

  return (
    <Card className="p-4 mb-3">
      <div className="grid grid-cols-[56px_1fr] gap-2 mb-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🍽️"
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-center text-lg focus:outline-none focus:border-amber-500"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Restaurant name"
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Short description (e.g. Burgers, fries & shakes)"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-amber-500"
      />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="number"
          step="0.1"
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          placeholder="Rating (e.g. 4.5)"
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        />
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Delivery time (e.g. 20 min)"
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>
      <input
        value={googleReviewLink}
        onChange={(e) => setGoogleReviewLink(e.target.value)}
        placeholder="Google review link (optional)"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:border-amber-500"
      />
      <p className="text-[11px] text-neutral-600 mb-3">
        To find this: search the restaurant on Google, tap its star rating, tap "Write a review,"
        then copy the web address that opens and paste it here. Leave blank to skip the Google
        review step for this restaurant.
      </p>
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-sm font-semibold rounded-lg py-2">
          {initial ? "Save changes" : "Add restaurant"}
        </button>
        <button onClick={onCancel} className="px-4 bg-neutral-800 hover:bg-neutral-700 text-sm rounded-lg">
          Cancel
        </button>
      </div>
    </Card>
  );
}

function MenuItemForm({ restaurantId, initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [desc, setDesc] = useState(initial?.desc || "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [cat, setCat] = useState(initial?.cat || "Bestsellers");
  const [icon, setIcon] = useState(initial?.icon || "🍴");

  const submit = () => {
    if (!name.trim() || !price) return;
    onSave({
      id: initial?.id || newOrderId(),
      restaurantId,
      name: name.trim(),
      desc: desc.trim(),
      price: Number(price) || 0,
      cat,
      icon: icon.trim() || "🍴",
    });
  };

  return (
    <Card className="p-4 mb-3">
      <div className="grid grid-cols-[56px_1fr] gap-2 mb-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="🍴"
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-2 py-2 text-center text-lg focus:outline-none focus:border-amber-500"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        />
      </div>
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Short description"
        className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-amber-500"
      />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price in ₹"
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"
        >
          <option value="Bestsellers">Bestsellers</option>
          <option value="More">More</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-sm font-semibold rounded-lg py-2">
          {initial ? "Save changes" : "Add item"}
        </button>
        <button onClick={onCancel} className="px-4 bg-neutral-800 hover:bg-neutral-700 text-sm rounded-lg">
          Cancel
        </button>
      </div>
    </Card>
  );
}

function AdminManageMenu({ restaurants, menuItems, onBack }) {
  const [openRestaurantId, setOpenRestaurantId] = useState(null);
  const [addingRestaurant, setAddingRestaurant] = useState(false);
  const [editingRestaurantId, setEditingRestaurantId] = useState(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);

  const openRestaurant = restaurants.find((r) => r.id === openRestaurantId);
  const itemsForOpen = menuItems.filter((m) => m.restaurantId === openRestaurantId);

  // ---- Viewing one restaurant's menu ----
  if (openRestaurant) {
    return (
      <Shell>
        <TopBar onBack={() => setOpenRestaurantId(null)} />
        <div className="px-5 pb-10 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{openRestaurant.icon}</span>
            <h2 className="text-lg font-bold">{openRestaurant.name}</h2>
          </div>
          <p className="text-xs text-neutral-500 mb-4">Changes here update the live menu for every customer immediately.</p>

          {itemsForOpen.map((item) =>
            editingItemId === item.id ? (
              <MenuItemForm
                key={item.id}
                restaurantId={openRestaurantId}
                initial={item}
                onCancel={() => setEditingItemId(null)}
                onSave={async (data) => {
                  await saveMenuItem(data);
                  setEditingItemId(null);
                }}
              />
            ) : (
              <Card key={item.id} className="p-3.5 mb-2 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center text-base shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{item.name}</div>
                  <div className="text-xs text-neutral-500">{money(item.price)} · {item.cat}</div>
                </div>
                <button onClick={() => setEditingItemId(item.id)} className="p-2 text-neutral-400 hover:text-amber-400">
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => deleteMenuItem(item.id)}
                  className="p-2 text-neutral-400 hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </Card>
            )
          )}

          {addingItem ? (
            <MenuItemForm
              restaurantId={openRestaurantId}
              onCancel={() => setAddingItem(false)}
              onSave={async (data) => {
                await saveMenuItem(data);
                setAddingItem(false);
              }}
            />
          ) : (
            <button
              onClick={() => setAddingItem(true)}
              className="w-full border border-dashed border-neutral-700 hover:border-amber-500 text-neutral-400 hover:text-amber-400 text-sm rounded-xl py-3 mt-2"
            >
              + Add menu item
            </button>
          )}
        </div>
      </Shell>
    );
  }

  // ---- Restaurant list ----
  return (
    <Shell>
      <TopBar onBack={onBack} />
      <div className="px-5 pb-10 flex-1">
        <h2 className="text-lg font-bold mb-1">Manage restaurants &amp; menus</h2>
        <p className="text-xs text-neutral-500 mb-4">Tap a restaurant to edit its menu. No code or redeploy needed.</p>

        {restaurants.map((r) =>
          editingRestaurantId === r.id ? (
            <RestaurantForm
              key={r.id}
              initial={r}
              onCancel={() => setEditingRestaurantId(null)}
              onSave={async (data) => {
                await saveRestaurant(data);
                setEditingRestaurantId(null);
              }}
            />
          ) : (
            <Card key={r.id} className="p-4 mb-2 flex items-center gap-3">
              <div
                onClick={() => setOpenRestaurantId(r.id)}
                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
              >
                <div className="w-11 h-11 rounded-lg bg-neutral-800 flex items-center justify-center text-xl shrink-0">
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-neutral-500 truncate">{r.desc}</div>
                </div>
              </div>
              <button onClick={() => setEditingRestaurantId(r.id)} className="p-2 text-neutral-400 hover:text-amber-400">
                <Pencil size={15} />
              </button>
              <button
                onClick={() => deleteRestaurant(r.id, menuItems.filter((m) => m.restaurantId === r.id))}
                className="p-2 text-neutral-400 hover:text-red-400"
              >
                <Trash2 size={15} />
              </button>
            </Card>
          )
        )}

        {addingRestaurant ? (
          <RestaurantForm
            onCancel={() => setAddingRestaurant(false)}
            onSave={async (data) => {
              await saveRestaurant(data);
              setAddingRestaurant(false);
            }}
          />
        ) : (
          <button
            onClick={() => setAddingRestaurant(true)}
            className="w-full border border-dashed border-neutral-700 hover:border-amber-500 text-neutral-400 hover:text-amber-400 text-sm rounded-xl py-3 mt-2"
          >
            + Add restaurant
          </button>
        )}
      </div>
    </Shell>
  );
}

function AdminDashboard({ restaurants, onLogout, onManageMenu }) {
  const [orders, setOrders] = useState([]);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAllOrders(setOrders);
    return () => unsubscribe();
  }, []);

  const showNewOrderBanner = useNewOrderAlert(orders.map((o) => o.id));

  const advance = async (orderId, currentStatusIndex) => {
    await updateOrderStatus(orderId, Math.min(currentStatusIndex + 1, STATUS_STEPS.length - 1));
  };

  const resetDemo = async () => {
    setResetting(true);
    await deleteAllOrders(orders);
    setResetting(false);
  };

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const byRestaurant = restaurants.map((r) => {
    const rOrders = orders.filter((o) => o.restaurantId === r.id);
    const rated = rOrders.filter((o) => o.customerRating);
    const avgRating = rated.length
      ? (rated.reduce((s, o) => s + o.customerRating, 0) / rated.length).toFixed(1)
      : null;
    return { ...r, count: rOrders.length, revenue: rOrders.reduce((s, o) => s + o.total, 0), avgRating, ratedCount: rated.length };
  });

  return (
    <Shell>
      <TopBar
        right={
          <button onClick={onLogout} className="text-neutral-500 hover:text-amber-400 flex items-center gap-1 text-xs">
            <LogOut size={14} /> Log out
          </button>
        }
      />
      <div className="px-5 pb-10 flex-1">
        {showNewOrderBanner && (
          <div className="bg-emerald-500 text-neutral-950 text-sm font-semibold rounded-xl px-4 py-3 mb-4 text-center animate-pulse">
            🔔 New order just came in!
          </div>
        )}
        <h2 className="text-lg font-bold mb-1">Admin overview</h2>
        <p className="text-xs text-neutral-500 mb-4">Live across all restaurants and seats.</p>

        <button
          onClick={onManageMenu}
          className="w-full bg-neutral-800 hover:bg-neutral-700 text-sm font-semibold rounded-xl py-3 mb-5"
        >
          🍽️ Manage restaurants &amp; menus
        </button>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <Card className="p-3.5">
            <div className="text-xs text-neutral-500">Total orders</div>
            <div className="text-xl font-bold">{orders.length}</div>
          </Card>
          <Card className="p-3.5">
            <div className="text-xs text-neutral-500">Total revenue</div>
            <div className="text-xl font-bold">{money(totalRevenue)}</div>
          </Card>
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-neutral-500 mb-2">BY RESTAURANT</h3>
        <div className="flex flex-col gap-2 mb-6">
          {byRestaurant.map((r) => (
            <Card key={r.id} className="p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{r.icon}</span>
                <span className="text-sm font-semibold">{r.name}</span>
              </div>
              <div className="text-right text-xs">
                <div>{r.count} orders</div>
                <div className="text-neutral-500">{money(r.revenue)}</div>
                {r.avgRating && (
                  <div className="text-amber-500">
                    ⭐ {r.avgRating} ({r.ratedCount})
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        <h3 className="text-xs font-semibold tracking-widest text-neutral-500 mb-2">ALL ORDERS</h3>
        {orders.length === 0 && <p className="text-sm text-neutral-600 text-center py-8">No orders yet.</p>}
        <div className="flex flex-col gap-3 mb-6">
          {orders.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-500">#{o.shortId}</span>
                <span className="text-xs text-neutral-500">
                  {o.audi} · Seat {o.seat}
                </span>
              </div>
              <div className="text-sm font-semibold mb-1">{o.restaurantName}</div>
              <div className="text-xs text-neutral-500 mb-2">{money(o.total)} · {o.items.length} items</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-500 font-semibold">{STATUS_STEPS[o.statusIndex]}</span>
                {o.statusIndex < STATUS_STEPS.length - 1 && (
                  <button
                    onClick={() => advance(o.id, o.statusIndex)}
                    className="text-xs bg-neutral-800 hover:bg-neutral-700 rounded-lg px-3 py-1.5"
                  >
                    Advance →
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>

        <button
          onClick={resetDemo}
          disabled={resetting}
          className="w-full flex items-center justify-center gap-2 text-xs text-neutral-500 hover:text-red-400 border border-neutral-800 rounded-lg py-2.5"
        >
          <RefreshCcw size={13} className={resetting ? "animate-spin" : ""} />
          Reset demo data
        </button>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* ROOT APP                                                             */
/* ------------------------------------------------------------------ */

const ACTIVE_ORDER_KEY = "seatbite_active_order";

export default function App() {
  const [screen, setScreen] = useState("landing");
  const [session, setSession] = useState(null); // { audi, seat }
  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState({});
  const [activeOrderId, setActiveOrderId] = useState(null);
  const [restId, setRestId] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [menuItems, setMenuItems] = useState([]);

  // Restaurants and menu items now live in the shared database, not in
  // this file. This fills the database with a starting point the very
  // first time (harmless to call again — it checks first and does
  // nothing if real data already exists), then keeps both lists live.
  useEffect(() => {
    seedDefaultRestaurantsIfEmpty();
    const unsubRestaurants = subscribeToRestaurants(setRestaurants);
    const unsubMenuItems = subscribeToMenuItems(setMenuItems);
    return () => {
      unsubRestaurants();
      unsubMenuItems();
    };
  }, []);

  const resetCustomerFlow = () => {
    setSession(null);
    setRestaurant(null);
    setCart({});
    setActiveOrderId(null);
    setScreen("landing");
    localStorage.removeItem(ACTIVE_ORDER_KEY);
  };

  const handleEnterQR = (qr) => {
    // Always land on the seat/auditorium confirmation screen after a scan.
    // The auditorium may already be known (from the QR); the seat is
    // always left blank here so the customer picks it manually next.
    setSession({ audi: qr.audi || null, seat: null });
    setScreen("pick-seat");
  };

  // If the page reloads for ANY reason (phone switches apps mid-payment,
  // browser reclaims memory, connection blip) right after a customer
  // paid, this brings them straight back to their order status screen
  // instead of losing track of their order and dumping them on the
  // home page. This check runs first — a saved order always wins over
  // a fresh QR link below.
  useEffect(() => {
    const saved = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (saved) {
      setActiveOrderId(saved);
      setScreen("order-status");
      return;
    }

    // If this page was opened via a real auditorium QR link
    // (e.g. https://yoursite.com/?code=AUD-PHX-4), jump straight to
    // the seat confirmation screen the moment the page loads — this is
    // what makes scanning with ANY phone camera app (not just SeatBite's
    // own scanner) work correctly.
    const params = new URLSearchParams(window.location.search);
    const codeFromLink = params.get("code");
    if (codeFromLink) {
      const rawCode = codeFromLink.trim().toUpperCase();
      const found = DEMO_QRS.find((q) => q.code === rawCode);
      handleEnterQR(found || { audi: null });
      // Clean the address bar so refreshing doesn't re-trigger this.
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {screen === "landing" && (
        <Landing
          onEnter={handleEnterQR}
          goScan={() => setScreen("scan")}
          goRestaurantLogin={() => setScreen("restaurant-login")}
          goAdminLogin={() => setScreen("admin-login")}
        />
      )}

      {screen === "scan" && (
        <CameraScanner
          onBack={() => setScreen("landing")}
          onResult={(rawCode) => {
            const found = DEMO_QRS.find((q) => q.code === rawCode);
            if (found) {
              handleEnterQR(found);
            } else {
              // Unknown code scanned — still let them proceed, in case
              // it's a real auditorium code added later.
              handleEnterQR({ code: rawCode, audi: null });
            }
          }}
        />
      )}

      {screen === "pick-seat" && (
        <PickAuditSeat
          initial={session || {}}
          onBack={() => setScreen("landing")}
          onDone={(s) => {
            setSession(s);
            setScreen("restaurants");
          }}
        />
      )}

      {screen === "restaurants" && (
        <RestaurantList
          session={session}
          restaurants={restaurants}
          onBack={() => setScreen("landing")}
          onPick={(r) => {
            setRestaurant(r);
            setCart({});
            setScreen("menu");
          }}
        />
      )}

      {screen === "menu" && (
        <Menu
          session={session}
          restaurant={restaurant}
          menuItems={menuItems.filter((m) => m.restaurantId === restaurant?.id)}
          cart={cart}
          setCart={setCart}
          onBack={() => setScreen("restaurants")}
          onViewCart={() => setScreen("cart")}
        />
      )}

      {screen === "cart" && (
        <CartScreen
          session={session}
          restaurant={restaurant}
          cart={cart}
          onBack={() => setScreen("menu")}
          onPaid={(order) => {
            setActiveOrderId(order.id);
            localStorage.setItem(ACTIVE_ORDER_KEY, order.id);
            setCart({});
            setScreen("order-status");
          }}
        />
      )}

      {screen === "order-status" && (
        <OrderStatus orderId={activeOrderId} restaurants={restaurants} onNewOrder={resetCustomerFlow} />
      )}

      {screen === "restaurant-login" && (
        <RestaurantLogin
          restaurants={restaurants}
          onBack={() => setScreen("landing")}
          onLogin={(id) => {
            setRestId(id);
            setScreen("restaurant-dashboard");
          }}
        />
      )}

      {screen === "restaurant-dashboard" && (
        <RestaurantDashboard restId={restId} restaurants={restaurants} onLogout={() => setScreen("landing")} />
      )}

      {screen === "admin-login" && (
        <AdminLogin onBack={() => setScreen("landing")} onLogin={() => setScreen("admin-dashboard")} />
      )}

      {screen === "admin-dashboard" && (
        <AdminDashboard
          restaurants={restaurants}
          onLogout={() => setScreen("landing")}
          onManageMenu={() => setScreen("admin-manage-menu")}
        />
      )}

      {screen === "admin-manage-menu" && (
        <AdminManageMenu
          restaurants={restaurants}
          menuItems={menuItems}
          onBack={() => setScreen("admin-dashboard")}
        />
      )}
    </>
  );
}
