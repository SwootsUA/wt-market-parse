const config = require('./cli')();
const {fetchPage, fetchItem} = require('./fetcher');
const {averageStats} = require('./stats');

const PAGE_SIZE = 100;
const FEE_RATE = 0.15;
const GENERAL_PRICE_DIVIDER = 100_000_000;
const SMALLEST_PRICE_STEP = 0.01;

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

    if (total === 0) {
        console.log('There is no items to fetch...');
        return [];
    } else {
        drawProgress(0);
    }

    const enriched = await Promise.all(
        profitable.map(async item => {
            const stats = await fetchItem(item.hash_name, config.debug);
            const avgStats = averageStats(stats);
            const avgPerDay = avgStats[0];
            const avgPrice = avgStats[1];

            completed += 1;
            drawProgress(completed);

            return {
                ...item,
                avgTransactionsPerDay: avgPerDay,
                avgValuePerTransaction: avgPrice,
            };
        })
    );

    process.stdout.write('\n');
    return enriched;
}

(async () => {
    try {
        const items = await fetchAllItems(config.pages);

        if (config.printOne) {
            console.log(items[0]);
        }

        const profitable = items
            .map(item => {
                const price = item.price / GENERAL_PRICE_DIVIDER;
                const buy = roundTo(item.buy_price / GENERAL_PRICE_DIVIDER, 2);
                const actualBuy = roundTo(buy + SMALLEST_PRICE_STEP, 2);
                const actualPrice = price - SMALLEST_PRICE_STEP;
                const proceeds = roundTo(actualPrice * (1 - FEE_RATE), 2);
                const number = Math.floor(config.balance / actualBuy);
                const profit = roundTo((proceeds - actualBuy) * number, 2);
                const mid = roundTo((actualBuy + actualPrice) / 2, 3);
                return {
                    hash_name: item.hash_name,
                    name: item.name,
                    buy_price: actualBuy,
                    number: number,
                    profit: profit,
                    mid: mid,
                };
            })
            .filter(
                i =>
                    i.profit / i.number > config.profit &&
                    i.number > 0 &&
                    i.buy_price > 0.1 &&
                    !i.name.includes(' key')
            );

        const enriched = await enrichAll(profitable);

        // compute score as weighted sum
        enriched.forEach(item => {
            const priceProximity = roundTo(
                item.mid === 0
                    ? 0
                    : Math.max(
                          0,
                          1 -
                              Math.abs(item.avgValuePerTransaction - item.mid) /
                                  item.mid
                      ),
                4
            );

            item.priceProximity = priceProximity;
            item.score = roundTo(
                0.4 * item.avgTransactionsPerDay +
                    0.5 * item.profit +
                    0.1 * priceProximity,
                3
            );
        });

        // sort by score, take top N
        const top = enriched
            .sort((a, b) => b.score - a.score)
            .slice(0, config.top);

        const presentation = top.map(item => {
            const obj = {
                hash_name: item.hash_name,
                buy_price: item.buy_price,
                number: item.number,
                score: item.score,
            };
            if (!config.noName) {
                obj.name = item.name;
            }
            return obj;
        });

        if (config.allInfo) {
            if (top.length > 0) {
                console.table(top);
            }
        } else {
            if (presentation.length > 0) {
                console.table(presentation);
            }
        }
    } catch (err) {
        console.error(err);
    }
})();
