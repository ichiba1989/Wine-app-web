// Checks the food rules (foods.js) on classic pairings. Run: node docs/tools/foods_check.mjs
import * as F from "../../foods.js";
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const rate = (food, kind) => F.pair(F.foodById(food), F.kindById(kind)).rating;
const want = (food, kind, ...r) => ok(r.includes(rate(food, kind)), `${food} with ${kind}: ${rate(food, kind)}, wanted ${r.join("/")}`);
want("steak", "full-red", "ideal"); want("steak", "crisp-white", "avoid", "okay"); want("steak", "sweet", "avoid");
want("lamb", "full-red", "ideal"); want("burger", "medium-red", "ideal", "good"); want("burger", "full-red", "ideal", "good");
want("oysters", "crisp-white", "ideal"); want("oysters", "sparkling", "ideal"); want("oysters", "full-red", "avoid"); want("oysters", "light-red", "okay", "avoid");
want("sushi", "crisp-white", "ideal", "good"); want("sushi", "full-red", "avoid");
want("lobster", "rich-white", "ideal"); want("lobster", "full-red", "avoid");
want("fried-fish", "sparkling", "ideal", "good"); want("fried-fish", "full-red", "avoid", "okay");
want("salmon", "rich-white", "ideal", "good"); want("salmon", "full-red", "avoid");
want("chicken", "rich-white", "ideal", "good"); want("chicken", "medium-red", "ideal", "good");
want("tomato", "medium-red", "ideal", "good"); want("tomato", "light-red", "ideal", "good");
want("salad", "crisp-white", "ideal"); want("salad", "full-red", "avoid");
want("curry", "offdry-white", "ideal", "good"); want("curry", "full-red", "avoid");
want("thai", "offdry-white", "ideal", "good");
want("chocolate", "sweet", "ideal"); want("chocolate", "fortified", "ideal", "good"); want("chocolate", "crisp-white", "avoid");
want("blue-cheese", "sweet", "ideal", "good"); want("blue-cheese", "fortified", "ideal", "good");
want("hard-cheese", "full-red", "ideal", "good");
want("nuts", "sparkling", "ideal", "good");
want("duck", "medium-red", "ideal", "good"); want("mushroom", "light-red", "ideal", "good");
// a pin from the database wins, and only when in use or checked
F.setPairingOverrides([{ food_id: "steak", kind_id: "crisp-white", rating: "ideal", reason: "test pin", status: "in use" }, { food_id: "salad", kind_id: "full-red", rating: "ideal", status: "suggested" }]);
ok(rate("steak", "crisp-white") === "ideal" && F.pair(F.foodById("steak"), F.kindById("crisp-white")).pinned, "a pin in use wins");
ok(rate("salad", "full-red") === "avoid", "a suggested pin is ignored");
F.setPairingOverrides([]); ok(rate("steak", "crisp-white") !== "ideal", "no pins: back to the score");
// tweaks only suggest what helps
const t = F.tweaksFor(F.foodById("grilled-fish"), "full-red"); ok(t.every((x) => x.gain > 0), "tweaks help");
const w = F.tweaksFor(F.foodById("curry"), "full-red"); ok(w.some((x) => x.id === "lessspice"), "less spice helps a full red with curry: " + w.map((x) => x.id));
// build a plate
const plate = F.platePairs({ main: "beef", sauce: "jus", side: "mushroom", cook: "grill" }); ok(plate[0].kind === "full-red" || plate[0].kind === "medium-red", "beef plate top: " + plate[0].kind);
const fish = F.platePairs({ main: "whitefish", sauce: "lemon", side: "salad", cook: "steam" }); ok(["crisp-white", "sparkling", "rose"].includes(fish[0].kind), "fish plate top: " + fish[0].kind);
// menu flow
const m = F.menuFromDishes(["steak", "oysters", "chocolate"]);
ok(m.suggestedOrder.join() === "oysters,steak,chocolate", "menu order: " + m.suggestedOrder.join());
ok(m.notes.length > 0, "a heavy-then-light order is flagged");
const mw = F.menuFromWines(["full-red", "crisp-white"]); ok(mw.notes.length === 1 && mw.suggestedOrder[0] === "crisp-white", "wines flow");
// grapes under kinds come from the stored grape rules
ok(F.grapesOf("full-red").includes("Cabernet Sauvignon") && !F.grapesOf("full-red").includes("Gamay"), "grapes in full red");
ok(F.grapesOf("crisp-white").includes("Sauvignon Blanc"), "grapes in crisp white");
ok(F.grapesOf("rose").length === 0 && F.grapesOf("sparkling").length === 0, "no grapes invented for rosé or sparkling");
console.log(`foods_check: ${pass} pass ${fail} fail`);
process.exit(fail ? 1 : 0);
