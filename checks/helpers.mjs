import { expect } from '/home/user/oss-new/control/runtime/index.mjs';

// A small PNG (an 8×8 terracotta square) for product photos.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4kueBFTEMLQkAC/NegSN0FzgAAAAASUVORK5CYII=',
  'base64',
);

/** Fills the product form's fields for one variant row. */
export async function fillVariant(page, index, { label, sku, price, compareAt, stock, track = true }) {
  const row = page.getByTestId(`variant-${index}`);
  await row.getByLabel('Option').fill(label);
  await row.getByLabel('SKU').fill(sku);
  await row.getByLabel('Price', { exact: true }).fill(price);
  await row.getByLabel('Compare-at price').fill(compareAt ?? '');
  const tracker = row.getByLabel('Track stock');
  if ((await tracker.isChecked()) !== track) await tracker.click();
  if (track) await row.getByLabel('Stock', { exact: true }).fill(String(stock));
}

/** Creates a product through the form and returns its id. */
export async function createProduct(page, { title, description, status, collections = [], variants, image }) {
  await page.goto('/products/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Description').fill(description ?? '');
  await page.getByLabel('Status').selectOption(status);
  for (const name of collections) await page.getByRole('checkbox', { name }).click();
  for (let i = 0; i < variants.length; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Add variant' }).click();
    await fillVariant(page, i, variants[i]);
  }
  if (image) {
    await page.getByTestId('image-input').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: image });
  }
  await Promise.all([
    page.waitForURL(/\/products\/[0-9a-f-]{36}$/),
    page.getByRole('button', { name: 'Save product' }).click(),
  ]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  return page.url().split('/').pop();
}

/** Places an order the way the storefront's cart does. */
export function checkout(runtime, lines, extra = {}) {
  return runtime.fetch('/s/api/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'rosa.mendes@example.com',
      name: 'Rosa Mendes',
      address: { line1: '41 Alder Street', city: 'Portland', postalCode: '97205', country: 'United States' },
      lines,
      ...extra,
    }),
  });
}

/** The variant ids of a product, read the way the storefront reads them. */
export async function variantIds(runtime, productId) {
  const { results } = await (await runtime.database()).prepare('SELECT id, label FROM variants WHERE product_id = ? ORDER BY position')
    .bind(productId)
    .all();
  return Object.fromEntries(results.map((row) => [row.label, row.id]));
}
