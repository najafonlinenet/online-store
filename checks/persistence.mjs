import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { PNG, checkout, createProduct, variantIds } from './helpers.mjs';

const runtime = await startRuntime();
try {
  let page = await (await runtime.context('owner')).newPage();
  await page.goto('/settings');
  await page.getByLabel('Store name').fill('Fernhill Candle Co.');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();
  const productId = await createProduct(page, {
    title: 'Cedar & Smoke Candle',
    status: 'active',
    image: PNG,
    variants: [{ label: '200 g', sku: 'CANDLE-CEDAR-200', price: '22.00', stock: 8 }],
  });
  const ids = await variantIds(runtime, productId);
  const placed = await checkout(runtime, [{ variantId: ids['200 g'], quantity: 2 }]);
  expect(placed.status).toBe(201);
  const { token } = await placed.json();

  await runtime.restart();

  page = await (await runtime.context('owner')).newPage();
  await page.goto('/products');
  await expect(page.getByTestId('product-row')).toContainText('Cedar & Smoke Candle');
  await page.goto('/inventory');
  await expect(page.getByTestId('inventory-row').filter({ hasText: 'CANDLE-CEDAR-200' }).getByTestId('quantity')).toHaveText('6');
  await page.goto('/orders');
  await expect(page.getByTestId('order-row')).toContainText('#1001');
  await expect(page.getByTestId('order-row')).toContainText('Rosa Mendes');
  const image = await runtime.fetch(`/s/img/${productId}`);
  expect(image.status).toBe(200);
  expect(image.headers.get('content-type')).toBe('image/png');
  const shop = await (await runtime.context(null)).newPage();
  await shop.goto('/s');
  await expect(shop.getByRole('heading', { level: 1 })).toHaveText('Fernhill Candle Co.');
  await shop.goto(`/s/o/${token}`);
  await expect(shop.getByRole('heading', { level: 1 })).toHaveText('Order #1001');
  console.log('persistence: ok');
} finally {
  await runtime.close();
}
