if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage:
  node index.js [PAGES_COUNT] [PROFIT_THRESHOLD] [PRINT_ITEM] [BALANCE] [TOP_COUNT]

Arguments:
  PAGES_COUNT       Number of item pages to fetch (default: 1)
  PROFIT_THRESHOLD  Minimum profit required per item (default: 0.1)
  PRINT_ITEM        Whether to print the first item (default: false)
  BALANCE           Your available balance (default: 1.00)
  TOP_COUNT         Number of top items to display by score (default: 10)

Example:
  node index.js 3 0.2 true 5.00 15
    `);
    process.exit(0);
}

const PAGES_COUNT = Number(process.argv[2]) || 1;
const PROFIT_THRESHOLD = Number(process.argv[3]) || 0.1;
const PRINT_ITEM = process.argv[4] === 'true';
const BALANCE = Number(process.argv[5]) || 1.0;
const TOP_COUNT = Number(process.argv[6]) || 10;

if (isNaN(PAGES_COUNT) || isNaN(PROFIT_THRESHOLD) || isNaN(BALANCE)) {
    console.error('❌ Invalid input. Use --help to see valid arguments.');
    process.exit(1);
}

const PAGE_SIZE = 100;
const FEE_RATE = 0.15;
const GENERAL_PRICE_DIVIDER = 100_000_000;
const SMALLEST_PRICE_STEP = 0.01;
const EPOCH_MULTIPLIER = 1_000;

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

async function fetchItem(item) {
    const params = new URLSearchParams({
        action: 'cln_get_pair_stat',
        token: TOKEN,
        appid: 1067,
        market_name: item,
        currencyid: 'gjn',
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
    if (!payload.response || !payload.response['1h']) {
        console.error(`Bad item ${item}: ${JSON.stringify(payload)}`);
        return [[0, 0, 0]];
    }

    // 1h is an array of sales in short term
    // each entry point in this array is an array
    // 1h[i][0] is time of the transaction, epoch divided by 1000
    // 1h[i][1] is price, in gjn coins, multiplied by 10000
    // 1h[i][2] is number of said transactions

    return payload.response['1h'];
}

function averageTransactionPerDay(transactions) {
    if (!transactions.length) return 0;
    const timeSpanSec =
        transactions[transactions.length - 1][0] - transactions[0][0];
    const totalCount = transactions.reduce((acc, cur) => acc + cur[2], 0);
    const secondsPerDay = 86400000 / EPOCH_MULTIPLIER;
    const daysSpan = timeSpanSec / secondsPerDay;
    return roundTo(totalCount / (daysSpan || 1), 1);
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
    return Math.round(number * 10 ** precision) / 10 ** precision;
}

(async () => {
    try {
        const items = await fetchAllItems(PAGES_COUNT);

        if (PRINT_ITEM) {
            console.log(items[0]);
        }

        const profitable = items
            .map(item => {
                const price = item.price / GENERAL_PRICE_DIVIDER;
                const buy = roundTo(
                    item.buy_price / GENERAL_PRICE_DIVIDER +
                        SMALLEST_PRICE_STEP,
                    2
                );
                const proceeds = roundTo(
                    (price - SMALLEST_PRICE_STEP) * (1 - FEE_RATE),
                    2
                );
                return {
                    hash_name: item.hash_name,
                    name: item.name,
                    buy_price: buy,
                    profit: roundTo(proceeds - buy, 2),
                };
            })
            .filter(
                i =>
                    i.profit > PROFIT_THRESHOLD &&
                    i.buy_price <= BALANCE &&
                    i.buy_price > 0.1
            );

        const enriched = await Promise.all(
            profitable.map(async item => {
                const stats = await fetchItem(item.hash_name);
                const avgPerDay = averageTransactionPerDay(stats);
                return {...item, avgTransactionsPerDay: avgPerDay};
            })
        );

        // compute score as weighted sum
        enriched.forEach(item => {
            item.score = 0.6 * item.avgTransactionsPerDay + 0.4 * item.profit;
        });

        // sort by score, take top N
        const top = enriched
            .sort((a, b) => b.score - a.score)
            .slice(0, TOP_COUNT);

        console.log(`Top ${TOP_COUNT} items:`);
        console.table(top);
    } catch (err) {
        console.error(err);
    }
})();
