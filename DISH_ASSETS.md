## Imported food catalog images

The 128 entries from `foods` in
https://github.com/truanayangi-com/truanayangi/blob/main/src/lib/foods.ts are
represented in `backend/dishes.json`. The existing Phở gà entry was reused,
so the catalog has 127 additional records rather than a duplicate Phở gà.

Every source image ID has a standalone WebP crop in `public/dish-assets/`, named
`truanayangi-NNN.webp`. Vite serves these at `/dish-assets/` from the Cloudflare
Pages site, independent of the backend API. The crops come from the sprite sheets used by
https://truanayangi.com/?theme=ket-hoi-tho-lun:

- IDs 0–35: `food-hd-0.webp`–`food-hd-8.webp`, 2×2 cells (627×627 px).
- IDs 36–71: `food-expanded-0.webp`–`food-expanded-2.webp`, 4×3 cells (362×362 px).
- IDs 72–119: `food-lunch-0.webp`–`food-lunch-3.webp`, 4×3 cells (362×362 px).
- IDs 120–131: `food-common-0.webp`, 4×3 cells (362×362 px).

The sprite sheets are divided into square cells in row-major order. Dish image
URLs in the JSON point to the frontend's `/dish-assets/` static assets.

Imported dishes use the catalog's `Lunch` tag. `Vegetarian`, `Pescatarian`,
and `High protein` are added only when supported by the source dish metadata
or estimated ingredients/macros. No Halal, Kosher, medical, or allergen tags
are inferred without reliable recipe details.

## Nutrition estimates

Nutrition fields are approximate values for a typical restaurant serving, not
laboratory measurements or recipe-specific facts. They were researched using
typical ingredient portions and food-component references, including USDA Food
Data Central: https://fdc.nal.usda.gov/. Actual calories and macros vary with
portion size, ingredients, and cooking method; sodium is especially variable
for broth, sauces, and seasonings. Treat these values as estimates.
