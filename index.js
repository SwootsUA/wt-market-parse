const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .options({
        pages: {
            alias: 'p',
            describe: 'Number of item pages to fetch',
            type: 'number',
            default: 1,
        },
        profit: {
            alias: 'r',
            describe: 'Minimum profit required per item',
            type: 'number',
            default: 0.1,
        },
        balance: {
            alias: 'b',
            describe: 'Your available balance',
            type: 'number',
            default: 1.0,
        },
        top: {
            alias: 't',
            describe: 'Number of top items to display by score',
            type: 'number',
            default: 10,
        },
        print: {
            alias: 'i',
            describe: 'Print the first item fetched fully',
            type: 'boolean',
            default: false,
        },
    })
    .check(argv => {
        if ([argv.pages, argv.profit, argv.balance, argv.top].some(isNaN)) {
            throw new Error('❌ Invalid numeric input. See --help.');
        }
        return true;
    })
    .help().argv;

const PAGES_COUNT = argv.pages;
const PROFIT_THRESHOLD = argv.profit;
const BALANCE = argv.balance;
const TOP_COUNT = argv.top;
const PRINT_ITEM = argv.print;

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
            item.score = roundTo(
                0.6 * item.avgTransactionsPerDay + 0.4 * item.profit,
                3
            );
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
