# Online Store

Sell products from a public storefront and run the store behind it: orders, stock, customers and discount codes, for your team.

Inspired by https://shopify.com

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Add products with variants, prices, stock, a photo and collections; draft, publish, archive or delete them.
- Share a storefront at `/s` where anyone can browse, search, filter by collection and keep a cart.
- Check out as a guest with a discount code, pay by card when payments are set up, and follow the order by its private link.
- List, filter and search orders; mark them paid, fulfill with tracking, cancel with restock, or refund.
- See tracked stock, filter to low or sold out, adjust it with a reason and read each variant's history.
- Keep a customer list built from checkouts, with order history, totals, notes and hand-added customers.
- Create percentage or fixed discount codes with minimums, usage limits and dates.
- Set the store's name, currency, shipping and low-stock level, open or close the storefront, and choose what each staff member can manage.

Left out: accounts and sign-in, which your Gateway handles; point of sale; other sales channels; themes; shipping labels and returns; multiple currencies and tax; marketing campaigns; reports.

## Setup

```sh
pnpm install
pnpm dev                 # run locally behind the local Gateway
pnpm test                # unit tests
pnpm run deploy          # deploy to your Cloudflare account
pnpm everyapp configure online-store
```

The app needs no secrets or settings. Two optional features:

- **Card payments**: the Gateway's `stripe` provider (`STRIPE_API_KEY`, from https://dashboard.stripe.com/apikeys). Buyers pay by card at checkout and admins can refund to the card. Without it, orders are placed as payment pending.
- **Order email**: the Gateway's email service. Buyers get an order confirmation and a shipping notice.

The checks in `checks/` run against a packaged release and cover the manual-payment path with neither feature set up; card checkout, card refunds and sending email reach third parties and were not run here.

## Limitations

- One store per install, one currency and one stock location.
- Changing the currency keeps the stored numbers of existing prices.
- Shipping is one flat rate with an optional free-shipping threshold; tax is not calculated.
- Each product has one photo, up to 5 MB.
- A buyer who leaves card checkout keeps an order marked payment pending until staff mark it paid or cancel it.
