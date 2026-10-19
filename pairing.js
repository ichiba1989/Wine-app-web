// Food ideas for a wine: which kinds of food usually suit the wine's STRUCTURE (acidity, body, tannin, sweetness, oak, bubbles).
// Pure (no browser, no network). The structure comes from structure.js (an editor's score, else the rules, never from this file).
// Each line below is a general pairing principle written in plain words, not a fact about any one bottle and not a taste test of a wine.
// Every line is marked `checked: false` until an editor has read it (owner, 2026-10-19: rules in code, to check); add a line by adding an entry.
//   needs: dimension -> [lowest, highest] the wine's value must fall in (acidity, body, tannin run 1-5; sweetness 0-3; co2 0-2; oak 0-2)
//   styles: which kinds of wine it is for (leave out for any)
//   why: the reason, in everyday words
export const PAIRINGS = [
  { id: "fried", dish: "Fried food, tempura, fish and chips", styles: ["white", "sparkling", "rose"], needs: { acidity: [4, 5], body: [1, 3], sweetness: [0, 1] }, why: "Bright, zippy wines cut through oil the way a squeeze of lemon does.", checked: false },
  { id: "oysters", dish: "Oysters and shellfish", styles: ["white", "sparkling"], needs: { acidity: [4, 5], body: [1, 3], oak: [0, 0] }, why: "Crisp wines with no oak keep the sea taste clean.", checked: false },
  { id: "sushi", dish: "Sushi and light raw fish", styles: ["white", "sparkling", "rose"], needs: { acidity: [3, 5], body: [1, 2], oak: [0, 0] }, why: "Delicate food needs a delicate wine that will not take over.", checked: false },
  { id: "grilled-fish", dish: "Grilled or baked fish", styles: ["white", "rose"], needs: { acidity: [3, 5], body: [2, 3], oak: [0, 1] }, why: "Medium weight and fresh acidity match fish without hiding it.", checked: false },
  { id: "creamy", dish: "Creamy pasta, lobster, butter sauces", styles: ["white"], needs: { body: [4, 5], acidity: [3, 5] }, why: "A fuller wine matches a rich sauce, and acidity keeps it from feeling heavy.", checked: false },
  { id: "chicken", dish: "Roast chicken and turkey", needs: { body: [2, 4], tannin: [1, 3], oak: [0, 1] }, why: "Mild meat suits medium-weight wines with soft tannin.", checked: false },
  { id: "salad", dish: "Green salads and goat cheese", styles: ["white", "rose", "sparkling"], needs: { acidity: [4, 5], oak: [0, 0], sweetness: [0, 0] }, why: "Sharp dressing and tangy cheese want a wine that is just as fresh.", checked: false },
  { id: "tomato", dish: "Tomato sauces, pizza", needs: { acidity: [4, 5], tannin: [1, 3] }, why: "Tomato is sharp, so the wine needs matching acidity or it tastes flat.", checked: false },
  { id: "mushroom", dish: "Mushrooms and earthy dishes", styles: ["red"], needs: { tannin: [1, 3], body: [2, 4], acidity: [3, 5] }, why: "Lighter, fresher reds sit well beside earthy flavours.", checked: false },
  { id: "pork-duck", dish: "Pork, duck, charcuterie", needs: { acidity: [3, 5], tannin: [1, 3], body: [2, 4] }, why: "Fatty meats like a wine with enough acidity to refresh the mouth.", checked: false },
  { id: "burger", dish: "Burgers and barbecue", styles: ["red"], needs: { body: [3, 5], tannin: [2, 4], sweetness: [0, 1] }, why: "Smoky, juicy food stands up to a wine with some weight.", checked: false },
  { id: "steak", dish: "Steak and grilled red meat", styles: ["red"], needs: { tannin: [4, 5], body: [4, 5] }, why: "Tannin loves fat and protein: the meat softens the wine and the wine cleans the plate.", checked: false },
  { id: "lamb", dish: "Lamb and roasts", styles: ["red"], needs: { tannin: [3, 5], body: [3, 5] }, why: "Rich, savoury meat suits a structured red.", checked: false },
  { id: "stew", dish: "Slow-cooked stews and braises", styles: ["red"], needs: { body: [4, 5], tannin: [3, 5] }, why: "Long-cooked, hearty food needs a big wine to keep up.", checked: false },
  { id: "spicy", dish: "Spicy food", needs: { sweetness: [1, 2], tannin: [1, 2], body: [1, 3] }, why: "A little sweetness cools the heat, while strong tannin makes spice feel sharper.", checked: false },
  { id: "asian", dish: "Thai and other aromatic stir-fries", styles: ["white", "rose", "sparkling"], needs: { acidity: [3, 5], sweetness: [0, 2], oak: [0, 0] }, why: "Fresh acidity balances salty, sour and sweet flavours together.", checked: false },
  { id: "veg", dish: "Roasted vegetables", needs: { body: [2, 3], acidity: [3, 5] }, why: "Gentle food, gentle wine, with a little acidity to lift it.", checked: false },
  { id: "soft-cheese", dish: "Soft and creamy cheese", needs: { acidity: [3, 5], body: [1, 3], tannin: [1, 2] }, why: "Fresh acidity cuts the creaminess.", checked: false },
  { id: "hard-cheese", dish: "Hard, aged cheese", needs: { body: [4, 5], tannin: [3, 5] }, why: "Strong, salty cheese needs a wine with plenty of power.", checked: false },
  { id: "blue-cheese", dish: "Blue cheese", needs: { sweetness: [2, 3] }, why: "Sweet wine against salty, pungent cheese is a classic contrast.", checked: false },
  { id: "dessert", dish: "Desserts and chocolate", needs: { sweetness: [2, 3] }, why: "The wine should be at least as sweet as the dessert or it tastes sour.", checked: false },
  { id: "fruit-dessert", dish: "Fruit tarts and light desserts", needs: { sweetness: [1, 3], acidity: [4, 5] }, why: "Sweetness with sharp acidity keeps fruity desserts bright.", checked: false },
  { id: "salty-snacks", dish: "Salty snacks and party food", styles: ["sparkling"], needs: { co2: [2, 2] }, why: "Bubbles refresh the mouth after salt and fat.", checked: false },
];

// Up to `limit` food ideas for a wine. values: the wine's structure ({ acidity, body, ... }, partial is fine); style: red, white, sparkling,
// rose or fortified. A line fits only when every structure value we HAVE falls inside its range, and at least two values were checked
// (one number alone is too thin to suggest food from). More specific lines (more values checked) come first.
export function foodIdeas(values, style, limit = 5) {
  const v = values || {};
  const out = [];
  PAIRINGS.forEach((p, order) => {
    if (p.styles && (!style || !p.styles.includes(style))) return;
    let known = 0, ok = true;
    for (const [dim, [lo, hi]] of Object.entries(p.needs)) {
      if (typeof v[dim] !== "number") continue;
      known += 1;
      if (v[dim] < lo || v[dim] > hi) { ok = false; break; }
    }
    if (ok && known >= Math.min(2, Object.keys(p.needs).length)) out.push({ id: p.id, dish: p.dish, why: p.why, checked: p.checked, known, order });
  });
  return out.sort((a, b) => b.known - a.known || a.order - b.order).slice(0, limit).map(({ known, order, ...rest }) => rest);
}
