const config = require('./modules/cli')();
const {
    fetchPage,
    fetchItem,
    fetchUserDeals,
    books,
    getUserBalance,
} = require('./modules/fetcher');
const {averageStats} = require('./modules/stats');
const {makeBarDrawer} = require('./modules/progress');
const {scoreItem} = require('./modules/score');
const fs = require('fs');
const path = require('path');

// simple pick helper so we don't need lodash
function pick(obj, keys) {
    return keys.reduce((out, k) => {
        if (k in obj) out[k] = obj[k];
        return out;
    }, {});
}

// helper to round to N significant figures
function roundSig(x, sig = 3) {
    if (typeof x !== 'number' || x === 0) return x;
    return parseFloat(x.toPrecision(sig));
}

const FEE_RATE = 0.15;
const PRICE_DIVIDER = 100_000_000;
const PRICE_STEP = 0.01;

(async () => {
    try {
        if (config.balance === -1) {
            config.balance = await getUserBalance();
        }

        if (config.deals) {
            const deals = await fetchUserDeals();
            const cols = ['type', 'amount', 'localPrice', 'market'];

            const data = deals.map(deal => ({
                ...pick(deal, cols),
                amount: parseInt(deal.amount),
                localPrice: deal.localPrice / 10_000,
            }));

            const usefulData = config.withTrophy
                ? data
                : data.filter(deal => !deal.market.includes('trophy'));

            const losingDeals = [];
            for (const deal of usefulData) {
                const dealMarket = await books(deal.market);
                const bestBuyPrice = dealMarket.BUY[0][0] / 10_000;
                const bestSellPrice = dealMarket.SELL[0][0] / 10_000;

                const stats = await fetchItem(deal.market);
                const [avgCount, avgValue] = averageStats(stats);

                deal.dailyTx = parseFloat(avgCount.toFixed(2));
                deal.txPrice = parseFloat(avgValue.toFixed(2));
                deal.perItemProfit = parseFloat(
                    (bestSellPrice * (1 - FEE_RATE) - bestBuyPrice).toFixed(2)
                );

                deal.buyPrice = bestBuyPrice;
                deal.sellPrice = bestSellPrice;

                if (deal.type === 'BUY' && bestBuyPrice > deal.localPrice) {
                    losingDeals.push({
                        ...deal,
                        betterPrice: bestBuyPrice,
                        sellPrice: bestSellPrice,
                    });
                }
                if (deal.type === 'SELL' && bestSellPrice < deal.localPrice) {
                    losingDeals.push({
                        ...deal,
                        betterPrice: bestSellPrice,
                        buyPrice: bestBuyPrice,
                    });
                }
            }

            // 1) Compute normalization factors
            const maxDailyTx = Math.max(...usefulData.map(d => d.dailyTx), 1);
            const maxProfit = Math.max(
                ...usefulData.map(d => d.perItemProfit),
                1
            );
            // 2) Now apply normalized scoring
            for (const deal of usefulData) {
                const normTx = deal.dailyTx / maxDailyTx;
                const normProfit = deal.perItemProfit / maxProfit;

                deal.score = parseFloat(
                    scoreItem({
                        dailyTx: normTx,
                        perItemProfit: normProfit,
                        txPrice: deal.txPrice,
                        buyPrice: deal.buyPrice,
                        sellPrice: deal.sellPrice,
                    }).toFixed(2)
                );
            }

            if (!config.bot) {
                usefulData.sort((a, b) => b.score - a.score);
                console.table(usefulData);
                const orderValue = usefulData.reduce((acc, cur) => {
                    const qty = Number(cur.amount);
                    const thisValue =
                        cur.type === 'BUY'
                            ? cur.localPrice * qty
                            : cur.localPrice * (1 - FEE_RATE) * qty;
                    return acc + thisValue;
                }, 0);
                console.log(
                    `Total value of orders is ${orderValue.toFixed(2)}`
                );
                const userBalance = await getUserBalance();
                console.log(`Availible balance: ${userBalance.toFixed(2)}`);
                const totalBalance = orderValue + userBalance;
                console.log(`Total balance: ${totalBalance.toFixed(2)}`);

                if (config.json) {
                    fs.appendFileSync(
                        './json_output/balance.log',
                        `${Date.now()
                            .toString()
                            .slice(0, 16)
                            .replace('T', ' ')}: ${totalBalance}\n`
                    );
                }
            }

            if (losingDeals.length === 0) {
                const userBalanceG = await getUserBalance();
                console.log(
                    'All deals are looking good\nBalance: ' +
                        userBalanceG.toFixed(2)
                );
                return;
            }

            if (config.bot) {
                const userBalanceN = await getUserBalance();
                for (const deal of losingDeals) {
                    const suggested = (
                        deal.type === 'BUY'
                            ? deal.betterPrice + PRICE_STEP
                            : deal.betterPrice - PRICE_STEP
                    ).toFixed(2);

                    // build the message
                    const msg = [
                        `⚠️ *New problem detected!*`,
                        ``,
                        `*Current Price:* \`${deal.localPrice.toFixed(2)}\``,
                        `*Suggested:* \`${suggested}\``,
                        ``,
                        `[View on Market](https://trade.gaijin.net/market/1067/${deal.market})`,
                    ].join('\n');

                    console.log(msg + '\nBalance: ' + userBalanceN.toFixed(2));
                }

                // early return so we don’t console.table as well
                return;
            }

            const output = losingDeals.map(deal => ({
                'Current Price': deal.localPrice.toFixed(2),
                'Suggested Price': (deal.type === 'BUY'
                    ? deal.betterPrice + PRICE_STEP
                    : deal.betterPrice - PRICE_STEP
                ).toFixed(2),
                URL: `https://trade.gaijin.net/market/1067/${deal.market}`,
            }));

            console.table(output);

            return;
        }

        // 1) Fetch all pages
        const barPages = makeBarDrawer(config.pages, 20, 'Fetching market');
        const pages = new Array(Math.min(config.pages, 100));

        for (let i = 0; i < pages.length; i++) {
            pages[i] = await fetchPage(i * 100, 100)
                .then(res => {
                    barPages.tick();
                    return res;
                })
                .catch(err => {
                    if (config.debug) {
                        console.error(
                            `⚠️ Page fetch #${i} failed:`,
                            err.message
                        );
                    }
                    barPages.tick();
                    return [];
                });
        }

        const allAssets = pages.flat();

        if (config.printOne && allAssets.length) {
            console.log(allAssets[0]);
        }

        // 2) Filter for profitable candidates
        const preCandidates = allAssets
            .map(item => {
                const sellPrice = item.price / PRICE_DIVIDER;
                const buyPrice = item.buy_price / PRICE_DIVIDER + PRICE_STEP;
                const proceeds = (sellPrice - PRICE_STEP) * (1 - FEE_RATE);
                const count = Math.floor(config.balance / buyPrice);
                const perItemProfit = proceeds - buyPrice;

                return {
                    hash_name: item.hash_name,
                    name: item.name,
                    buyPrice,
                    sellPrice,
                    number: count,
                    perItemProfit,
                };
            })
            .filter(
                i =>
                    i.number > 0 &&
                    i.perItemProfit > config.profit &&
                    !i.name.includes(' key') &&
                    i.buyPrice >= 0.1 // is real price
            );

        let candidates;

        if (config.unique) {
            const uniqueDeals = await fetchUserDeals();
            const dealsSet = new Set();
            for (const deal of uniqueDeals) {
                dealsSet.add(deal.market);
            }
            candidates = preCandidates.filter(i => !dealsSet.has(i.name));
        } else {
            candidates = preCandidates;
        }

        // 3) Enrich with stats
        const pLimit = require('p-limit').default;
        const CONCURRENCY = Infinity; // tweak this up/down to find the sweet spot
        const limit = pLimit(CONCURRENCY);

        const barItems = makeBarDrawer(candidates.length, 20, 'Fetching items');
        const enriched = new Array(candidates.length);

        // schedule all fetches, but only CONCURRENCY at once
        let successCount = 0;
        let failureCount = 0;

        // helper with retry unchanged
        async function fetchWithRetry(hash, retries = 3, delayMs = 500) {
            try {
                return await fetchItem(hash);
            } catch (err) {
                if (retries > 0) {
                    await new Promise(r => setTimeout(r, delayMs));
                    return fetchWithRetry(hash, retries - 1, delayMs * 2);
                }
                throw err;
            }
        }

        // schedule all fetches, but only CONCURRENCY at once
        const tasks = candidates.map((item, i) =>
            limit(() =>
                fetchWithRetry(item.hash_name)
                    .then(stats => {
                        successCount++;
                        const [avgCount, avgValue] = averageStats(stats);
                        enriched[i] = {
                            ...item,
                            dailyTx: avgCount,
                            txPrice: avgValue,
                        };
                    })
                    .catch(err => {
                        failureCount++;
                        if (config.debug) {
                            console.error(
                                `⚠️ Item fetch #${i} failed:`,
                                err.message
                            );
                        }
                    })
                    .finally(() => barItems.tick())
            )
        );

        await Promise.all(tasks);

        // log summary
        console.log(`\n✅ Fetched items:   ${successCount}`);
        console.log(`❌ Failed items:    ${failureCount}`);
        console.log(`🔢 Total attempted: ${candidates.length}\n`);

        const maxDailyTx = Math.max(...enriched.map(it => it.dailyTx), 1);
        const maxProfit = Math.max(...enriched.map(it => it.perItemProfit), 1);

        // 4) Score each item
        enriched.forEach(it => {
            const dailyTxNorm = it.dailyTx / maxDailyTx;
            const profitNorm = it.perItemProfit / maxProfit;
            it.score = scoreItem({
                dailyTx: dailyTxNorm,
                perItemProfit: profitNorm,
                txPrice: it.txPrice,
                buyPrice: it.buyPrice,
                sellPrice: it.sellPrice,
            });
        });

        // 5) Sort
        const sorted = enriched.sort((a, b) => b.score - a.score);
        const cols = [
            'hash_name',
            'buyPrice',
            'number',
            'perItemProfit',
            'score',
        ];

        if (config.showName) cols.push('name');

        const top = sorted.slice(0, config.top).map(item => pick(item, cols));
        const raw = config.allInfo ? sorted : top;

        const display = raw.map(item => {
            const o = {...item};
            Object.entries(o).forEach(([k, v]) => {
                if (typeof v === 'number') {
                    o[k] = roundSig(v, 3);
                }
            });
            return o;
        });

        // 6) Show
        console.table(display);

        if (config.json) {
            const outDir = path.resolve(__dirname, 'json_output');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `pages${Math.min(
                config.pages,
                100
            )}_${timestamp}.json`;
            const filePath = path.join(outDir, filename);

            const itemsToWrite = config.allInfo
                ? display
                : display.slice(0, config.top);

            fs.writeFileSync(
                filePath,
                JSON.stringify(itemsToWrite, null, 2),
                'utf8'
            );
            console.log(`→ Wrote ${itemsToWrite.length} items to ${filePath}`);
        }
    } catch (err) {
        console.error(err);
    }
})();
