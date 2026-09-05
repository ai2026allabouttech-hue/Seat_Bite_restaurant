import { initializeApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore";

// TODO: Replace every REPLACE_ME value below with YOUR real Firebase
// project config. Get it from: Firebase Console -> Project settings ->
// scroll to "Your apps" -> the web app (</>) you registered.
// These values are all safe to have visible in the website's code —
// none of them are secret passwords.
const firebaseConfig = {
  apiKey: "AIzaSyCSS_FENIBa7Ft5md40AGka_Zhwb8rhtrk",
  authDomain: "seatbite-4a1f1.firebaseapp.com",
  projectId: "seatbite-4a1f1",
  storageBucket: "seatbite-4a1f1.firebasestorage.app",
  messagingSenderId: "384606318475",
  appId: "1:384606318475:web:4cb627147f8010a3d3898e",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// All orders live in one shared "orders" folder (called a "collection"
// in Firestore) — every customer, restaurant, and admin reads/writes
// the same one, which is what makes everything sync live.
export const ordersCollection = collection(db, "orders");

// Restaurants and their menu items live here too — editing them from
// the Admin panel updates this shared data, so every customer's phone
// sees the change immediately, with no code changes or redeploy needed.
export const restaurantsCollection = collection(db, "restaurants");
export const menuItemsCollection = collection(db, "menuItems");
