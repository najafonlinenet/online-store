import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { checkout, createProduct, variantIds } from './helpers.mjs';

const runtime = await startRuntime();
try {
  // Anonymous and outsider are refused on every staff page; owner and member get in.
  await runtime.assertPrivateAccess(['/', '/products', '/products/new', '/collections', '/inventory', '/orders', '/discounts']);
  for (const path of ['/customers', '/settings', '/health']) {
    for (const role of [undefined, 'outsider']) {
      const response = await runtime.fetch(path, role ? { role } : {});
      expect([401, 403]).toContain(response.status);
    }
  }

  const owner = await (await runtime.context('owner')).newPage();
  const activeId = await createProduct(owner, {
    title: 'Hand-dyed Wool Scarf',
    status: 'active',
    variants: [{ label: 'Moss', sku: 'SCARF-MOSS', price: '45.00', stock: 4 }],
  });
  const draftId = await createProduct(owner, {
    title: 'Unreleased Cashmere Beanie',
    status: 'draft',
    variants: [{ label: 'Grey', sku: 'BEANIE-GREY', price: '60.00', stock: 2 }],
  });
  const ids = await variantIds(runtime, activeId);
  const placed = await checkout(runtime, [{ variantId: ids.Moss, quantity: 1 }]);
  expect(placed.status).toBe(201);
  const { token } = await placed.json();
  const other = await checkout(runtime, [{ variantId: ids.Moss, quantity: 1 }], {
    email: 'jonas.weber@example.de',
    name: 'Jonas Weber',
  });
  expect(other.status).toBe(201);

  // Public routes show only active products, and an order only by its token.
  const anon = await (await runtime.context(null)).newPage();
  await anon.goto('/s');
  await expect(anon.getByTestId('product-card')).toHaveCount(1);
  await expect(anon.locator('body')).not.toContainText('Unreleased Cashmere Beanie');
  expect((await runtime.fetch('/s/p/unreleased-cashmere-beanie')).status).toBe(404);
  expect((await runtime.fetch(`/s/img/${draftId}`)).status).toBe(404);
  const storeHtml = await (await runtime.fetch('/s')).text();
  for (const secret of ['rosa.mendes@example.com', 'BEANIE-GREY', 'SCARF-MOSS']) expect(storeHtml).not.toContain(secret);

  await anon.goto(`/s/o/${token}`);
  await expect(anon.getByRole('heading', { level: 1 })).toHaveText('Order #1001');
  await expect(anon.locator('body')).toContainText('Rosa Mendes');
  await expect(anon.locator('body')).not.toContainText('Jonas Weber');
  const wrong = await runtime.fetch('/s/o/not-a-real-order-token-at-all');
  expect(wrong.status).toBe(404);
  expect(await wrong.text()).not.toContain('Rosa Mendes');
  for (const path of ['/s/o', '/s/api/orders', '/orders?anon=1']) {
    const response = await runtime.fetch(path);
    expect(response.status).not.toBe(200);
  }

  // Staff permissions: a new member has products and orders, not customers or settings.
  const member = await (await runtime.context('member')).newPage();
  await member.goto('/orders');
  await expect(member.getByTestId('order-row')).toHaveCount(2);
  await member.goto('/customers');
  await expect(member.getByTestId('access-denied')).toBeVisible();
  await expect(member.locator('body')).not.toContainText('rosa.mendes@example.com');
  await member.goto('/settings');
  await expect(member.getByTestId('access-denied')).toBeVisible();

  // A member can't run admin-only server functions, even by calling them directly.
  async function captureCall(page, trigger) {
    let captured;
    await page.route('**/_serverFn/**', async (route) => {
      const request = route.request();
      if (request.method() === 'POST' && !captured) {
        captured = { url: new URL(request.url()), headers: await request.allHeaders(), body: request.postData() };
        await route.abort();
      } else await route.continue();
    });
    await trigger();
    await expect.poll(() => Boolean(captured)).toBe(true);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    return captured;
  }
  async function replay(call, role) {
    const headers = { ...call.headers };
    delete headers.cookie;
    delete headers['content-length'];
    return runtime.fetch(call.url.pathname + call.url.search, { role, method: 'POST', headers, body: call.body });
  }

  // Granting permissions is the admin's.
  await owner.goto('/settings');
  const memberRow = owner.getByTestId('member-row').filter({ hasNotText: '(you)' });
  await expect(owner.getByTestId('member-row')).toHaveCount(2);
  await expect(memberRow).toHaveCount(1);
  const grant = await captureCall(owner, () => memberRow.getByLabel('Customers').click());
  const sneaky = await replay(grant, 'member');
  expect(sneaky.status).not.toBe(200);
  await member.goto('/customers');
  await expect(member.getByTestId('access-denied')).toBeVisible();

  // Refunds are the admin's.
  await owner.goto('/orders');
  await owner.getByRole('link', { name: '#1001' }).click();
  await owner.getByRole('button', { name: 'Mark as paid' }).click();
  await expect(owner.getByTestId('order-state')).toContainText('Paid');
  owner.once('dialog', (d) => d.accept());
  const refund = await captureCall(owner, () => owner.getByRole('button', { name: 'Refund' }).click());
  expect((await replay(refund, 'member')).status).not.toBe(200);
  expect((await replay(refund, 'outsider')).status).not.toBe(200);
  const { results } = await (await runtime.database()).prepare('SELECT payment_status FROM orders WHERE number = 1001').all();
  expect(results[0].payment_status).toBe('paid');
  await member.goto('/orders');
  await member.getByRole('link', { name: '#1001' }).click();
  await expect(member.getByRole('heading', { level: 1 })).toHaveText('Order #1001');
  await expect(member.getByRole('button', { name: 'Refund' })).toHaveCount(0);

  // The owner grants customers; the member then sees them. Revoked, refused again.
  await owner.goto('/settings');
  await memberRow.getByLabel('Customers').click();
  await expect(owner.getByText('Permissions saved')).toBeVisible();
  await member.goto('/customers');
  await expect(member.getByTestId('customer-row')).toHaveCount(2);
  await memberRow.getByLabel('Products').click();
  await expect(owner.getByText('Permissions saved')).toBeVisible();
  await member.goto('/products');
  await expect(member.getByTestId('access-denied')).toBeVisible();
  await member.goto('/inventory');
  await expect(member.getByTestId('access-denied')).toBeVisible();

  // No sign-in of the app's own.
  for (const path of ['/login', '/signin', '/sign-in', '/signup', '/register', '/s/login', '/s/account']) {
    const response = await runtime.fetch(path, { role: 'owner' });
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toMatch(/type="password"/);
  }
  for (const path of ['/s', `/s/o/${token}`]) {
    expect(await (await runtime.fetch(path)).text()).not.toMatch(/type="password"/);
  }
  console.log('authorization: ok');
} finally {
  await runtime.close();
}
