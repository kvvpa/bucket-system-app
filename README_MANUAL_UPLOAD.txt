# Slice Board functional raster pie files

Drop-in files included:

- `src/AppFixed.tsx`
- `src/main.tsx`
- `src/vite-env.d.ts`
- `src/img/pizza/pizza-sauce-only.png`
- `src/img/pizza/pizza-cheese-only.png`
- `src/img/pizza/pizza-pepperoni.png`
- `src/img/pizza/pizza-basil.png`
- `src/img/pizza/pizza-mushroom.png`
- `src/img/pizza/pizza-olive.png`
- `src/img/pizza/pizza-pepper.png`
- `src/img/pizza/pizza-onion.png`

Manual upload steps:

1. In the repo, create this folder if it does not exist:
   `src/img/pizza/`

2. Upload all PNG files into:
   `src/img/pizza/`

3. Replace:
   `src/AppFixed.tsx`

4. Replace:
   `src/main.tsx`

5. Replace:
   `src/vite-env.d.ts`

6. Commit to `main`.

What this does:

- Uses real PNG/raster pizza textures.
- Keeps mathematical proportional wedge windows.
- Selects texture by slice topping.
- Keeps Sauce only for Unassigned.
- Keeps Plain cheese for Remaining.
- Keeps named buckets mapped to real toppings.
- Does not draw toppings with SVG/canvas.
- Uses SVG only for invisible clipping/masking geometry.

Background cleanup update:

These PNGs were cleaned into true-alpha assets so the checkerboard preview background is removed. Outer background and donut center are transparent.
