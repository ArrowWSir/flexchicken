// The shop's printed menu board (menu.jpg, October 2026): what is sold, under
// which heading, in board order, at the board price. The live site's product
// data only fills in options, descriptions and photos.
//
// Item fields:
//   from         live-site product id to take the id, options, description and photo from
//   id           a new item's id, for dishes the live site never had
//   optionsFrom  product ids whose options a new item copies (first label wins)
//   photo        a cut-out in public/menu/ to use instead of the product's own
//   description  copy for a new item, or to replace the product's
//
// A section with `section` instead of `items` lists that live-site section as
// it is (drinks: not on the board, still sold).

const MEAL = "Served with chips & drink.";
// A meal's fries and drink choices, taken from a plain wings meal.
const FRIES_AND_DRINK = 1207;

export const MENU_BOARD = [
  {
    id: "burgers",
    label: "Burgers",
    short: "Burgers",
    icon: "burger",
    items: [
      { from: 1155, name: "Chicken Fillet Burger", price: 4.49 },
      { from: 1156, name: "1/4 Pounder Burger", price: 4.49 },
      { from: 1157, name: "Hot Honey Burger", price: 4.99 },
      { from: 1158, name: "1/2 Pounder Burger", price: 5.49 },
      { from: 1159, name: "Spicy Chicken Burger", price: 4.49 },
      { from: 1160, name: "Chicken Strips Burger", price: 3.49 },
      { from: 1161, name: "BBQ Fillet Burger", price: 4.49 },
      { from: 1162, name: "Peri Peri Burger", price: 5.49 },
      { from: 1163, name: "Double Fillet Burger", price: 5.99 },
      { from: 1164, name: "Cheeseburger", price: 2.38 },
      { id: "smash-burger", name: "Smash Burger", price: 6.49 },
      { from: 1166, name: "Flex Fusion Burger", price: 5.99 },
      { from: 1167, name: "Triple Flex Burger", price: 6.49 },
      { from: 1168, name: "Double Cheeseburger", price: 3.99 },
      { from: 1169, name: "Hash Brown Stack", price: 4.99 },
    ],
  },
  {
    id: "wraps",
    label: "Wraps",
    short: "Wraps",
    icon: "utensils",
    items: [
      { from: 1627, name: "Chicken Wrap", price: 4.49, photo: "chicken-wrap" },
      { from: 1622, name: "Spicy Chicken Wrap", price: 4.99 },
    ],
  },
  {
    id: "bbq",
    label: "BBQ",
    short: "BBQ",
    icon: "grill",
    items: [
      { from: 1712, name: "Spicy BBQ Fillet Burger", price: 5.49 },
      { from: 1179, name: "BBQ Fillet Burger Meal", price: 6.49 },
      { from: 1713, name: "Spicy BBQ Fillet Burger Meal", price: 7.49 },
      { from: 1714, name: "BBQ Wings – 3 Piece", price: 1.99 },
      { from: 1730, name: "BBQ Wings – 5 Piece", price: 2.99 },
      { from: 1731, name: "BBQ Wings – 8 Piece", price: 3.99 },
      { from: 1732, name: "BBQ Wings – 12 Piece", price: 5.99 },
      { from: 1733, name: "BBQ Wings – 20 Piece", price: 9.99 },
      {
        id: "bbq-wings-meal-5",
        name: "BBQ Wings Meal – 5 Piece",
        price: 6.99,
        optionsFrom: [FRIES_AND_DRINK],
        description: MEAL,
      },
    ],
  },
  {
    id: "ribs",
    label: "Ribs",
    short: "Ribs",
    icon: "bbq",
    items: [
      { from: 1739, name: "BBQ Ribs – 1 Piece", price: 2.49 },
      { id: "bbq-ribs-2", name: "BBQ Ribs – 2 Piece", price: 4.89 },
      { from: 1741, name: "BBQ Ribs – 5 Piece", price: 9.89 },
      { id: "bbq-ribs-8", name: "BBQ Ribs – 8 Piece", price: 17.89 },
      { from: 1742, name: "BBQ Ribs – 12 Piece", price: 22.99 },
    ],
  },
  {
    id: "peri-peri",
    label: "Peri Peri",
    short: "Peri Peri",
    icon: "flame",
    items: [
      { from: 1214, name: "Peri Peri Chicken – Whole", price: 12.99, description: "Whole chicken, 4 cut." },
      { from: 1215, name: "Peri Peri Chicken – Half", price: 8.99, description: "Half chicken, 2 cut." },
      { from: 1956, name: "Peri Peri Wings – 3 Piece", price: 3.99 },
      { from: 1957, name: "Peri Peri Wings – 5 Piece", price: 5.99 },
      { from: 1958, name: "Peri Peri Wings – 8 Piece", price: 9.49 },
      { id: "peri-peri-wings-12", name: "Peri Peri Wings – 12 Piece", price: 12.49, optionsFrom: [1958] },
      { from: 1959, name: "Peri Peri Wings – 20 Piece", price: 19.99 },
      { from: 1180, name: "Peri Peri Burger Meal", price: 7.49 },
      { from: 1625, name: "Peri Peri Wrap Meal", price: 6.99 },
      {
        id: "peri-peri-wings-meal-half",
        name: "Peri Peri Wings Meal – Half",
        price: 9.99,
        optionsFrom: [1958, FRIES_AND_DRINK],
        description: MEAL,
      },
    ],
  },
  {
    id: "burger-meals",
    label: "Burger Meals",
    short: "Burger Meals",
    icon: "burger-meal",
    items: [
      { from: 1173, name: "Chicken Fillet Burger Meal", price: 5.99 },
      { from: 1174, name: "1/4 Pounder Burger Meal", price: 6.49 },
      { from: 1175, name: "Hot Honey Burger Meal", price: 6.99 },
      { from: 1176, name: "1/2 Pounder Burger Meal", price: 7.49 },
      { from: 1177, name: "Spicy Chicken Burger Meal", price: 6.49 },
      { from: 1178, name: "Chicken Strips Burger Meal", price: 5.49 },
      // The board says £6.99 here and £6.49 under BBQ; one item has one price.
      { from: 1179, name: "BBQ Fillet Burger Meal", price: 6.49 },
      { from: 1180, name: "Peri Peri Burger Meal", price: 7.49 },
      { from: 1181, name: "Double Fillet Burger Meal", price: 7.99 },
      { from: 1182, name: "Cheeseburger Meal", price: 5.39 },
      { from: 1183, name: "Smash Burger Meal", price: 8.49 },
      { from: 1184, name: "Fusion Flex Burger Meal", price: 7.99 },
      { from: 1185, name: "Triple Flex Burger Meal", price: 6.49 },
      { from: 1186, name: "Double Cheeseburger Meal", price: 5.99 },
      { id: "hash-brown-stack-meal", name: "Hash Brown Stack Meal", price: 6.99, optionsFrom: [1175], description: MEAL },
    ],
  },
  {
    id: "box-meals",
    label: "Box Meals",
    short: "Box Meals",
    icon: "box",
    items: [
      { from: 1188, name: "Chicken Fillet Burger Box Meal", price: 7.99 },
      { from: 1189, name: "1/4 Pounder Burger Box Meal", price: 8.49 },
      { from: 1191, name: "1/2 Pounder Burger Box Meal", price: 8.49 },
      { from: 1192, name: "Spicy Chicken Burger Box Meal", price: 8.49 },
      { from: 1190, name: "Fusion Flex Burger Box Meal", price: 9.99 },
      { from: 1193, name: "Flex Variety Box", price: 7.49 },
    ],
  },
  {
    id: "wings-chicken",
    label: "Wings & Chicken",
    short: "Wings",
    icon: "drumstick",
    items: [
      { from: 1195, name: "4 Spicy Wings", price: 2.29 },
      { from: 1196, name: "6 Spicy Wings", price: 3.2 },
      { from: 1197, name: "8 Spicy Wings", price: 3.99 },
      { from: 1198, name: "12 Spicy Wings", price: 5.99 },
      { from: 1199, name: "20 Spicy Wings", price: 9.49 },
      { from: 1200, name: "1 Piece Chicken", price: 1.79 },
      { from: 1201, name: "2 Piece Chicken", price: 2.99 },
      { from: 1202, name: "3 Piece Chicken", price: 4.49 },
      { id: "4-piece-chicken", name: "4 Piece Chicken", price: 5.89 },
      { from: 1204, name: "6 Piece Chicken", price: 8.49 },
      { from: 1205, name: "10 Piece Chicken", price: 14.49 },
      { from: 1208, name: "3 Spicy Wings Meal", price: 4.49 },
      { from: 1207, name: "6 Spicy Wings Meal", price: 5.99 },
      { from: 1209, name: "1 Piece Chicken Meal", price: 4.49 },
      { from: 1211, name: "2 Piece Chicken Meal", price: 5.99 },
      { from: 1212, name: "3 Piece Chicken Meal", price: 7.49 },
      { from: 1210, name: "Flex Combo Meal 1", price: 5.99 },
    ],
  },
  {
    id: "boneless",
    label: "Boneless Chicken",
    short: "Boneless",
    icon: "popcorn",
    items: [
      { from: 1217, name: "5 Chicken Strips", price: 4.49 },
      { from: 1218, name: "10 Chicken Strips", price: 9.49 },
      { from: 1219, name: "Regular Popcorn Chicken", price: 3.49 },
      { from: 1206, name: "Large Popcorn Chicken", price: 6.99 },
      { from: 1221, name: "6 Chicken Nuggets", price: 3.49 },
      { from: 1222, name: "9 Chicken Nuggets", price: 6.49 },
      { from: 1223, name: "20 Chicken Nuggets", price: 10.99 },
      { from: 1224, name: "Chicken Strips Meal", price: 6.49 },
      { from: 1726, name: "6 Chicken Nuggets Meal", price: 4.49 },
      { from: 1725, name: "Regular Popcorn Chicken Meal", price: 4.49 },
    ],
  },
  {
    id: "sides",
    label: "Sides & Dips",
    short: "Sides",
    icon: "salad",
    items: [
      { from: 1225, name: "Fries (Regular)", price: 1.99 },
      { from: 1226, name: "Fries (Large)", price: 2.79 },
      { from: 1227, name: "Mozzarella Sticks (4 Pcs)", price: 1.99 },
      { from: 1228, name: "Mozzarella Sticks (8 Pcs)", price: 3.49 },
      { from: 1229, name: "Onion Rings (6 Pcs)", price: 1.99 },
      { from: 1230, name: "Onion Rings (12 Pcs)", price: 3.89 },
      { from: 1231, name: "Onion Rings (20 Pcs)", price: 5.49 },
      { from: 1232, name: "Coleslaw", price: 1.49 },
      { from: 1233, name: "Beans", price: 1.49 },
      { id: "dip-garlic-mayo", name: "Garlic Mayo", price: 0.5 },
      { id: "dip-chilli-mayo", name: "Chilli Mayo", price: 0.5 },
      { id: "dip-peri-peri-sauce", name: "Peri Peri Sauce", price: 0.5 },
      { id: "dip-sweet-chilli-sauce", name: "Sweet Chilli Sauce", price: 0.5 },
      { id: "dip-bbq-sauce", name: "BBQ Sauce", price: 0.5 },
    ],
  },
  { id: "drinks", label: "Drinks", short: "Drinks", icon: "cup", section: "drinks" },
];
