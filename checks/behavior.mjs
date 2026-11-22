import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { PNG, checkout, createProduct, variantIds } from './helpers.mjs';

const runtime = await startRuntime();
try {
  const staff = await runtime.context('owner');
  const page = await staff.newPage();

  // F008: store settings.
  await page.goto('/settings');
  await page.getByLabel('Store name').fill('Juniper Ceramics');
  await page.getByLabel('Currency').selectOption('USD');
  await page.getByLabel('Flat shipping rate').fill('6.00');
  await page.getByLabel('Free shipping from').fill('150.00');
  await page.getByLabel('Low stock at').fill('3');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();
  await expect(page.getByTestId('integration-payments')).toContainText('Not set up');
  await expect(page.getByTestId('integration-email')).toContainText('Not set up');

  // F001: a collection and products.
  await page.goto('/collections');
  await page.getByLabel('Name').fill('Mugs');
  await page.getByRole('button', { name: 'Add collection' }).click();
  await expect(page.getByRole('row', { name: /Mugs/ })).toContainText('mugs');

  await page.goto('/products/new');
  await page.getByLabel('Title').fill('Speckled Stoneware Mug');
  await expect(page.getByLabel('Handle')).toHaveValue('speckled-stoneware-mug');
  // A compare-at price at or below the price is refused.
  await page.getByTestId('variant-0').getByLabel('Option').fill('Sand');
  await page.getByTestId('variant-0').getByLabel('Price', { exact: true }).fill('28.00');
  await page.getByTestId('variant-0').getByLabel('Compare-at price').fill('20.00');
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByRole('alert')).toContainText('Compare-at price must be higher than the price');

  const mugId = await createProduct(page, {
    title: 'Speckled Stoneware Mug',
    description: 'Wheel-thrown mug in a speckled glaze. Holds 350 ml.',
    status: 'active',
    collections: ['Mugs'],
    image: PNG,
    variants: [
      { label: 'Sand', sku: 'MUG-SAND', price: '28.00', compareAt: '34.00', stock: 5 },
      { label: 'Slate', sku: 'MUG-SLATE', price: '28.00', stock: 0 },
    ],
  });
  await expect(page.getByTestId('product-image')).toBeVisible();
  const towelId = await createProduct(page, {
    title: 'Linen Tea Towel',
    status: 'draft',
    variants: [{ label: 'Natural', sku: 'TOWEL-NAT', price: '12.00', stock: 20 }],
  });

  await page.goto('/products');
  await expect(page.getByTestId('product-row')).toHaveCount(2);
  await page.getByLabel('Status').selectOption('draft');
  await expect(page.getByTestId('product-row')).toHaveCount(1);
  await expect(page.getByTestId('product-row')).toContainText('Linen Tea Towel');
  await page.getByLabel('Status').selectOption('all');
  await expect(page.getByTestId('product-row')).toHaveCount(2);
  await page.getByPlaceholder('Search products').fill('stoneware');
  await expect(page.getByTestId('product-row')).toHaveCount(1);
  await expect(page.getByTestId('product-row')).toContainText('Speckled Stoneware Mug');

  // F007: a discount code.
  await page.goto('/discounts');
  await page.getByRole('button', { name: 'New code' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code').fill('welcome10');
  await dialog.getByLabel('Type').selectOption('percentage');
  await dialog.getByLabel('Amount').fill('10');
  await dialog.getByRole('button', { name: 'Save code' }).click();
  await expect(page.getByRole('row', { name: /WELCOME10/ })).toContainText('Active');

  // F002: the storefront, as a buyer with no account.
  const buyerContext = await runtime.context(null);
  const shop = await buyerContext.newPage();
  await shop.goto('/s');
  await expect(shop.getByRole('heading', { level: 1 })).toHaveText('Juniper Ceramics');
  const card = shop.getByTestId('product-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Speckled Stoneware Mug');
  await expect(card).toContainText('$28.00');
  await expect(card).toContainText('$34.00');
  await expect(shop.locator('body')).not.toContainText('Linen Tea Towel');
  await shop.getByRole('link', { name: 'Mugs' }).click();
  await expect(shop.getByTestId('product-card')).toHaveCount(1);
  await shop.goto('/s?q=towel');
  await expect(shop.getByTestId('product-card')).toHaveCount(0);
  await shop.goto('/s?q=speckled');
  await shop.getByTestId('product-card').click();
  await expect(shop.getByRole('heading', { level: 1 })).toHaveText('Speckled Stoneware Mug');
  await shop.getByLabel('Option').selectOption({ label: 'Slate' });
  await expect(shop.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  await shop.getByLabel('Option').selectOption({ label: 'Sand' });
  await expect(shop.getByLabel('Quantity')).toHaveAttribute('max', '5');
  await shop.getByLabel('Quantity').fill('2');
  await shop.getByRole('button', { name: 'Add to cart' }).click();
  await expect(shop.getByTestId('cart-count')).toHaveText('2');

  await shop.goto('/s/cart');
  await expect(shop.getByTestId('cart-line')).toHaveCount(1);
  await shop.reload();
  await expect(shop.getByTestId('cart-line')).toContainText('Speckled Stoneware Mug');
  await expect(shop.getByTestId('cart-subtotal')).toHaveText('$56.00');
  await shop.getByTestId('cart-line').getByLabel('Quantity').fill('3');
  await expect(shop.getByTestId('cart-subtotal')).toHaveText('$84.00');
  await shop.getByTestId('cart-line').getByLabel('Quantity').fill('2');
  await expect(shop.getByTestId('cart-subtotal')).toHaveText('$56.00');

  // F003: checkout.
  await shop.getByLabel('Email').fill('maya.okafor@example.net');
  await shop.getByLabel('Full name').fill('Maya Okafor');
  await shop.getByLabel('Address').fill('18 Harbour Lane');
  await shop.getByLabel('City').fill('Bristol');
  await shop.getByLabel('Postal code').fill('BS1 4RN');
  await shop.getByLabel('Country').fill('United Kingdom');
  await shop.getByLabel('Discount code').fill('welcome10');
  await Promise.all([
    shop.waitForURL(/\/s\/o\/[A-Za-z0-9_-]{20,}$/),
    shop.getByRole('button', { name: 'Place order' }).click(),
  ]);
  const statusUrl = new URL(shop.url());
  await expect(shop.getByRole('heading', { level: 1 })).toHaveText('Order #1001');
  await expect(shop.getByTestId('order-subtotal')).toHaveText('$56.00');
  await expect(shop.getByTestId('order-discount')).toHaveText('−$5.60');
  await expect(shop.getByTestId('order-shipping')).toHaveText('$6.00');
  await expect(shop.getByTestId('order-total')).toHaveText('$56.40');
  await expect(shop.getByTestId('payment-status')).toHaveText('Payment pending');
  await expect(shop.getByTestId('fulfillment-status')).toHaveText('Not shipped yet');
  await shop.goto('/s/cart');
  await expect(shop.getByText('Your cart is empty')).toBeVisible();

  // Server-side checks on the public routes.
  const ids = await variantIds(runtime, mugId);
  const cart = await runtime.fetch('/s/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: [{ variantId: ids.Sand, quantity: 50 }, { variantId: ids.Slate, quantity: 1 }] }),
  });
  expect(cart.status).toBe(200);
  const cartBody = await cart.json();
  expect(cartBody.lines).toHaveLength(1);
  expect(cartBody.lines[0].quantity).toBe(3);
  const tooMany = await checkout(runtime, [{ variantId: ids.Sand, quantity: 4 }]);
  expect(tooMany.status).toBe(409);
  const soldOut = await checkout(runtime, [{ variantId: ids.Slate, quantity: 1 }]);
  expect(soldOut.status).toBe(409);
  const towel = await variantIds(runtime, towelId);
  expect((await checkout(runtime, [{ variantId: towel.Natural, quantity: 1 }])).status).toBe(409);
  const badCode = await checkout(runtime, [{ variantId: ids.Sand, quantity: 1 }], { code: 'NOPE' });
  expect(badCode.status).toBe(400);
  const { results: orderCount } = await (await runtime.database()).prepare('SELECT count(*) AS n FROM orders').all();
  expect(orderCount[0].n).toBe(1);

  // A second order, then cancelled: stock comes back.
  const second = await checkout(runtime, [{ variantId: ids.Sand, quantity: 1 }]);
  expect(second.status).toBe(201);
  const secondBody = await second.json();
  expect(secondBody.number).toBe(1002);
  expect(new URL(secondBody.redirect).hostname).toBe(runtime.hostname);

  // F004: order management.
  await page.goto('/orders');
  await expect(page.getByTestId('order-row')).toHaveCount(2);
  await page.getByPlaceholder('Search by number or email').fill('maya');
  await expect(page.getByTestId('order-row')).toHaveCount(1);
  await expect(page.getByTestId('order-row')).toContainText('#1001');
  await expect(page.getByTestId('order-row')).toContainText('$56.40');
  await page.getByPlaceholder('Search by number or email').fill('');
  await page.getByLabel('Payment').selectOption('paid');
  await expect(page.getByText('No orders match')).toBeVisible();
  await page.getByLabel('Payment').selectOption('all');

  await page.getByRole('link', { name: '#1002' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order #1002');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByTestId('order-state')).toContainText('Cancelled');
  await expect(page.getByTestId('timeline')).toContainText('Cancelled and restocked');

  // F005: inventory, with history from checkout and cancellation.
  await page.goto('/inventory');
  const sand = page.getByTestId('inventory-row').filter({ hasText: 'MUG-SAND' });
  await expect(sand).toContainText('3');
  await page.getByLabel('Show').selectOption('out');
  await expect(page.getByTestId('inventory-row')).toHaveCount(1);
  await expect(page.getByTestId('inventory-row')).toContainText('MUG-SLATE');
  await page.getByLabel('Show').selectOption('low');
  await expect(page.getByTestId('inventory-row')).toHaveCount(2);
  await page.getByLabel('Show').selectOption('all');
  await sand.getByRole('button', { name: 'Adjust' }).click();
  const adjust = page.getByRole('dialog');
  await adjust.getByLabel('Change').selectOption('add');
  await adjust.getByLabel('Amount').fill('12');
  await adjust.getByLabel('Reason').selectOption('received');
  await adjust.getByRole('button', { name: 'Save' }).click();
  await expect(sand.getByTestId('quantity')).toHaveText('15');
  await sand.getByRole('button', { name: 'Adjust' }).click();
  await adjust.getByLabel('Change').selectOption('add');
  await adjust.getByLabel('Amount').fill('-40');
  await adjust.getByLabel('Reason').selectOption('damaged');
  await adjust.getByRole('button', { name: 'Save' }).click();
  await expect(adjust.getByRole('alert')).toContainText('below zero');
  await adjust.getByRole('button', { name: 'Close' }).first().click();
  await sand.getByRole('button', { name: 'History' }).click();
  const history = page.getByTestId('history-row');
  await expect(history).toHaveCount(5);
  await expect(history.nth(0)).toContainText('Received');
  await expect(history.nth(0)).toContainText('+12');
  await expect(history.nth(1)).toContainText('Restocked');
  await expect(history.nth(1)).toContainText('#1002');
  await expect(history.nth(3)).toContainText('Sold');
  await expect(history.nth(3)).toContainText('#1001');
  await page.keyboard.press('Escape');

  // F006: customers.
  await page.goto('/customers');
  const maya = page.getByTestId('customer-row').filter({ hasText: 'maya.okafor@example.net' });
  await expect(maya).toContainText('Maya Okafor');
  await expect(maya).toContainText('1');
  await page.getByRole('button', { name: 'Add customer' }).click();
  const add = page.getByRole('dialog');
  await add.getByLabel('Name').fill('Theo Lindqvist');
  await add.getByLabel('Email').fill('Theo@Example.org');
  await add.getByRole('button', { name: 'Add customer' }).click();
  await expect(page.getByTestId('customer-row').filter({ hasText: 'theo@example.org' })).toBeVisible();
  await expect(add).toHaveCount(0);
  await page.getByRole('button', { name: 'Add customer' }).click();
  await add.getByLabel('Email').fill('MAYA.OKAFOR@example.net');
  await add.getByRole('button', { name: 'Add customer' }).click();
  await expect(add.getByRole('alert')).toContainText('already exists');
  await page.keyboard.press('Escape');
  await maya.getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Maya Okafor');
  await expect(page.getByRole('link', { name: '#1001' })).toBeVisible();
  await page.getByLabel('Notes').fill('Prefers recyclable packaging.');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText('Customer saved')).toBeVisible();

  // F001: an ordered product can't be deleted, only archived.
  await page.goto(`/products/${mugId}`);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('alert')).toContainText('Archive it instead');
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByLabel('Status')).toHaveValue('archived');
  const gone = await runtime.fetch('/s/p/speckled-stoneware-mug');
  expect(gone.status).toBe(404);
  const dropped = await runtime.fetch('/s/api/cart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: [{ variantId: ids.Sand, quantity: 1 }] }),
  });
  expect((await dropped.json()).lines).toHaveLength(0);
  await page.getByLabel('Status').selectOption('active');
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByText('Product saved')).toBeVisible();
  await page.goto(`/products/${towelId}`);
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForURL(/\/products$/), page.getByRole('button', { name: 'Delete' }).click()]);
  await expect(page.getByTestId('product-row')).toHaveCount(1);

  // F007: a code at its usage limit is refused; the list shows it used up.
  await (await runtime.database()).prepare("INSERT INTO discounts (id, code, kind, value, usage_limit, usage_count, enabled, created_at) VALUES ('d-once', 'ONCEONLY', 'fixed', 500, 1, 0, 1, '2026-01-01T00:00:00Z')")
    .run();
  expect((await checkout(runtime, [{ variantId: ids.Sand, quantity: 1 }], { code: 'onceonly' })).status).toBe(201);
  expect((await checkout(runtime, [{ variantId: ids.Sand, quantity: 1 }], { code: 'ONCEONLY' })).status).toBe(400);
  await page.goto('/discounts');
  await expect(page.getByRole('row', { name: /ONCEONLY/ })).toContainText('Used up');
  await expect(page.getByRole('row', { name: /WELCOME10/ })).toContainText('1');

  // F008: closing the storefront.
  await page.goto('/settings');
  await page.getByLabel('Storefront open').click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();
  await shop.goto('/s');
  await expect(shop.getByTestId('store-closed')).toBeVisible();
  await expect(shop.getByTestId('product-card')).toHaveCount(0);
  expect((await checkout(runtime, [{ variantId: ids.Sand, quantity: 1 }])).status).toBe(403);
  await page.getByLabel('Storefront open').click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved')).toBeVisible();

  // Phone-sized smoke: the storefront and the orders list.
  const phone = await runtime.context(null, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phonePage = await phone.newPage();
  await phonePage.goto('/s');
  await expect(phonePage.getByTestId('product-card')).toBeVisible();
  const staffPhone = await (await runtime.context('owner', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await staffPhone.goto('/orders');
  await expect(staffPhone.getByRole('heading', { level: 1 })).toHaveText('Orders');
  await expect(staffPhone.getByTestId('order-row').first()).toBeVisible();

  // F004: pay and ship the first order; the buyer sees it.
  await page.goto('/orders');
  await runtime.assertBackLink(page);
  await page.getByRole('link', { name: '#1001' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Order #1001');
  await page.getByRole('button', { name: 'Mark as paid' }).click();
  await expect(page.getByTestId('order-state')).toContainText('Paid');
  await page.getByRole('button', { name: 'Fulfill' }).click();
  const ship = page.getByRole('dialog');
  await ship.getByLabel('Carrier').fill('Royal Mail');
  await ship.getByLabel('Tracking number').fill('RM482913376GB');
  await ship.getByRole('button', { name: 'Mark as fulfilled' }).click();
  await expect(page.getByTestId('order-state')).toContainText('Fulfilled');
  await expect(page.getByRole('button', { name: 'Fulfill' })).toHaveCount(0);
  await page.getByLabel('Staff notes').fill('Gift wrap in kraft paper.');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Notes saved')).toBeVisible();
  const timeline = page.getByTestId('timeline');
  await expect(timeline).toContainText('Placed by maya.okafor@example.net');
  await expect(timeline).toContainText('Marked as paid');
  await expect(timeline).toContainText('Shipped with Royal Mail, tracking RM482913376GB');

  await shop.goto(statusUrl.pathname);
  await expect(shop.getByTestId('payment-status')).toHaveText('Paid');
  await expect(shop.getByTestId('fulfillment-status')).toContainText('Shipped');
  await expect(shop.getByTestId('fulfillment-status')).toContainText('RM482913376GB');

  await page.goto('/customers');
  await expect(page.getByTestId('customer-row').filter({ hasText: 'maya.okafor@example.net' })).toContainText('$56.40');

  await page.goto('/orders');
  await page.getByRole('link', { name: '#1001' }).click();
  await expect(page.getByTestId('timeline')).toContainText('Shipped with Royal Mail');
  await runtime.screenshot(page);
  console.log('behavior: ok');
} finally {
  await runtime.close();
}
