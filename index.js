if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage:
  node index.js [ITEMS_COUNT] [PROFIT_THRESHOLD] [PRINT_ITEM] [BALANCE]

Arguments:
  PAGES_COUNT       Number of item pages to fetch (default: 1)
  PROFIT_THRESHOLD  Minimum profit required per item (default: 0.1)
  PRINT_ITEM        Whether to print the first item (default: false)
  BALANCE           Your available balance (default: 1.00)

Example:
  node index.js 3 0.2 true 5.00
    `);
    process.exit(0);
}

const PAGES_COUNT      = Number(process.argv[2]) || 1;
const PROFIT_THRESHOLD = Number(process.argv[3]) || 0.1;
const PRINT_ITEM       = process.argv[4] === 'true';
const BALANCE          = Number(process.argv[5]) || 1.00;

if (isNaN(PAGES_COUNT) || isNaN(PROFIT_THRESHOLD) || isNaN(BALANCE)) {
    console.error("❌ Invalid input. Use --help to see valid arguments.");
    process.exit(1);
}

const PAGE_SIZE = 100;
const FEE_RATE = 0.15;
const PRICE_DIVIDER = 100_000_000;
const SMALLEST_STEP = 0.01;

require('dotenv').config();
const TOKEN = process.env.WT_TOKEN;

async function fetchPage(skip = 0, count = PAGE_SIZE) {
    const params = new URLSearchParams({
        action: 'cln_market_search',
        token: TOKEN,
        skip: skip.toString(),
        count: count.toString(),
        text: '',
        language: 'en_US',
        options: 'any_sell_orders;include_marketpairs',
    });

    const res = await fetch('https://market-proxy.gaijin.net/web', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
        },
        body: params.toString(),
    });
    const payload = await res.json();
    if (!payload.response || !payload.response.assets) {
        throw new Error(
            `Bad payload at skip=${skip}: ${JSON.stringify(payload)}`
        );
    }
    return payload.response.assets;
}

async function fetchAllItems(pages = 1, pageSize = PAGE_SIZE) {
    const allAssets = [];

    for (let i = 0; i < pages; i++) {
        const skip = i * pageSize;
        console.log(`Fetching items ${skip}–${skip + pageSize - 1}…`);
        const pageAssets = await fetchPage(skip, pageSize);
        allAssets.push(...pageAssets);
    }

    return allAssets;
}

function roundTo(number, precision) {
    return Math.round(number * (10 ** precision)) / (10 ** precision);
}

(async () => {
    try {
        const items = await fetchAllItems(PAGES_COUNT);

	if (PRINT_ITEM) {
	    console.log(items[0]);
	}
	
        const profitableItems = items
            .map(item => {
                const price = item.price / PRICE_DIVIDER;
                const buy = roundTo((item.buy_price / PRICE_DIVIDER) + SMALLEST_STEP, 2);
                const proceeds = roundTo((price - SMALLEST_STEP) * (1 - FEE_RATE), 2);
                return {
                    name: item.name,
                    buy_price: buy,
                    profit: roundTo(proceeds - buy, 2),
                };
            })
            .filter(i => i.profit > 0) // positive profit after fee
            .filter(i => i.buy_price <= BALANCE) // you can afford
            .filter(i => i.profit > PROFIT_THRESHOLD) // at least 0.05 profit
	    .sort((a, b) => b.profit - a.profit); // sort by profit, descendeng

        console.log('Profitable items:', profitableItems);
    } catch (err) {
        console.error(err);
    }
})();
