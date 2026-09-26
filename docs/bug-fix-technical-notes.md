# Technical notes – product details not updating on variant change (Task 3)

**Branch:** `assessment` · **Files changed:** 1 (`assets/product-info.js`, +2 lines) · **Liquid/markup changes:** none

## Symptom

On the product page, changing a variant option updated the price, image and buy button, but the **SKU** and **inventory status** could stay invisible for the newly selected variant.

Reproduction:

1. Product with two variants: variant A has **no SKU** and **inventory not tracked**; variant B has a SKU and tracked inventory.
2. Add the SKU and Inventory blocks to the product page.
3. Load the product on variant A, then select variant B.
4. **Expected:** variant B's SKU and stock message appear. **Actual:** both stay hidden.

## How a variant change updates the page

1. `assets/global.js` → `VariantSelects` publishes `PUB_SUB_EVENTS.optionValueSelectionChange`.
2. `assets/product-info.js` → `handleOptionValueChange()` fetches the section for the new variant (Section Rendering API, `?section_id=…&option_values=…`).
3. `handleUpdateProductInfo()` copies fresh content into the page through the local helper `updateSourceFromDestination(id, shouldHide)` (lines 196–205), called for `price`, `Sku`, `Inventory`, `Volume` and `Price-Per-Item`.

Everything else on this path was checked and works as intended: option picker, pub/sub wiring, price snippet, buy button and form input, pickup availability, quantity rules, media update, script load order in `layout/theme.liquid`, and variant picker CSS.

## Root cause

The theme uses two different hiding classes:

| Class | CSS (`assets/base.css`) | Effect |
|---|---|---|
| `hidden` | `display: none !important` | Removed from layout |
| `visibility-hidden` | `visibility: hidden` | Invisible, keeps its space |

`sections/main-product.liquid` adds **`visibility-hidden`** to:

- the Inventory block (line 150) when `inventory_management != 'shopify'`
- the SKU block (line 207) when `sku.size == 0`

`updateSourceFromDestination` in `assets/product-info.js`:

```js
destination.innerHTML = source.innerHTML;
destination.classList.toggle('hidden', shouldHide(source));
```

It replaces the element's **content** and toggles **`hidden`**, but never touches **`visibility-hidden`**. If the initially rendered variant had no SKU or untracked inventory, the element keeps `visibility-hidden` permanently. Later variants get their content injected, but it stays invisible.

A related inconsistency: the SKU `shouldHide` callback checks `classList.contains('hidden')`, but the SKU element is only ever rendered with `visibility-hidden`, so that check can never be true.

## Change

`assets/product-info.js`, inside `updateSourceFromDestination`, **lines 202–203** (added):

```js
destination.innerHTML = source.innerHTML;
destination.classList.toggle('hidden', shouldHide(source));
// Liquid hides empty SKU / untracked inventory with 'visibility-hidden', sync it with the new variant
destination.classList.toggle('visibility-hidden', source.classList.contains('visibility-hidden'));
```

After the content swap, the live element's `visibility-hidden` state is set to match the element Shopify just rendered for the selected variant.

## Why this approach

- **Server render is the source of truth.** The page ends up identical to a fresh page load on the selected variant, so the Liquid conditions remain the single place that decides visibility.
- **Minimal and non-destructive.** 2 lines, no Liquid or CSS changes, no removed code.
- **No layout shift.** Switching the Liquid to `hidden` instead would collapse the empty SKU/inventory line and make the content below jump; the existing reserved-space behaviour is kept.
- **Covers every caller.** The helper is shared, so price, volume pricing and price-per-item get the same guarantee. Elements never rendered with `visibility-hidden` are unaffected (the toggle simply keeps it off).

## Regression checks

- Switching between variants with/without SKU and with tracked/untracked inventory, in both directions.
- Unavailable option combinations still go through `setUnavailable()` (uses `hidden`) and recover when a valid variant is selected.
- Price, sale/sold-out badges, media, add-to-cart state and pickup availability unchanged.
- Quick add modal (collection pages) uses the same helper and benefits from the fix.
- Shopify Theme Check: 0 errors, no new warnings.
