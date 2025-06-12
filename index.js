const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');
const {describe, boolean} = require('yargs');

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
        debug: {
            alias: 'd',
            describe: 'Print out warnings during script execution',
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
const DEBUG = argv.debug;

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
        appid_filter: 1067,
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
    let payload;
    try {
        payload = await res.json();
    } catch (error) {
        if (DEBUG) {
            console.error(`Bad item ${item}: ${error}, ${res}`);
        }
        return [[0, 0, 0]];
    }
    if (!payload.response || !payload.response['1h']) {
        if (DEBUG) {
            console.error(`Bad item ${item}: ${JSON.stringify(payload)}`);
        }
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
    const barWidth = 20; // total characters in the bar

    for (let i = 0; i < pages; i++) {
        const skip = i * pageSize;
        const pageAssets = await fetchPage(skip, pageSize);
        allAssets.push(...pageAssets);

        const completed = i + 1;
        const pct = completed / pages;
        const filledBars = Math.round(pct * barWidth);
        const emptyBars = barWidth - filledBars;

        const bar =
            'Fetching market: [' +
            '#'.repeat(filledBars) +
            '.'.repeat(emptyBars) +
            `] ${(pct * 100).toFixed(0)}%`;

        process.stdout.write(`\r${bar}`);
    }

    process.stdout.write('\n');

    return allAssets;
}
function roundTo(number, precision) {
    return Math.round(number * 10 ** precision) / 10 ** precision;
}

async function enrichAll(profitable) {
    const total = profitable.length;
    let completed = 0;
    const barWidth = 20;

    function drawProgress(count) {
        const pct = count / total;
        const filled = Math.round(pct * barWidth);
        const empty = barWidth - filled;
        const bar =
            'Fetching items: [' +
            '#'.repeat(filled) +
            '.'.repeat(empty) +
            `] ${(pct * 100).toFixed(0)}%`;
        process.stdout.write(`\r${bar}`);
    }

    drawProgress(0);

    const enriched = await Promise.all(
        profitable.map(async item => {
            const stats = await fetchItem(item.hash_name);
            const avgPerDay = averageTransactionPerDay(stats);

            completed += 1;
            drawProgress(completed);

            return {...item, avgTransactionsPerDay: avgPerDay};
        })
    );

    process.stdout.write('\n');
    return enriched;
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
                const number = Math.floor(BALANCE / buy);
                const profit = roundTo((proceeds - buy) * number, 2);
                return {
                    hash_name: item.hash_name,
                    name: item.name,
                    buy_price: buy,
                    number: number,
                    profit: profit,
                };
            })
            .filter(
                i =>
                    i.profit / i.number > PROFIT_THRESHOLD &&
                    i.number > 0 &&
                    i.buy_price > 0.1 &&
                    !i.name.includes(' key')
            );

        const enriched = await enrichAll(profitable);

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

        console.table(top);
    } catch (err) {
        console.error(err);
    }
})();
