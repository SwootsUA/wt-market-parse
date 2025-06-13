const config = require('./modules/cli')();
const {
    fetchPage,
    fetchItem,
    fetchUserDeals,
    books,
} = require('./modules/fetcher');
const {averageStats} = require('./modules/stats');
const {makeBarDrawer} = require('./modules/progress');
const {scoreItem} = require('./modules/score');

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
        if (config.deals) {
            const deals = await fetchUserDeals();
            const cols = ['type', 'localPrice', 'market'];

            const data = deals.map(deal => ({
                ...pick(deal, cols),
                localPrice: deal.localPrice / 10_000
            }));

            const usefulData = config.withTrophy ? data : data.filter(deal =>
                !deal.market.includes('trophy')
            );

            const losingDeals = [];
            for (const deal of usefulData) {
                const dealMarket = await books(deal.market);
                const bestBuyPrice = dealMarket.BUY[0][0] / 10_000;
                const bestSellPrice = dealMarket.SELL[0][0] / 10_000;
                
                if (deal.type === 'BUY' && bestBuyPrice > deal.localPrice) {
                    losingDeals.push({...deal, betterPrice: bestBuyPrice, sellPrice: bestSellPrice});
                } 
                if (deals.type === 'SELL' && bestSellPrice < deal.localPrice) {
                    losingDeals.push({...deal, betterPrice: bestSellPrice, buyPrice: bestBuyPrice});
                }
            }
            
            if (losingDeals.length > 0) {
                console.table(losingDeals);
            } else {
                console.log("All deals are looking good")
            }

            for (const deal of losingDeals) {
                console.log(`New order price: ${roundSig(deal.type === 'BUY' ? deal.betterPrice + PRICE_STEP : deal.betterPrice - PRICE_STEP, 2)}`);
                console.log(`Order URL: https://trade.gaijin.net/market/1067/${deal.market}`);
            }

            return;
        }

        // 1) Fetch all pages
        const barPages = makeBarDrawer(config.pages, 20, 'Fetching market');
        const tasks = Array.from({length: config.pages}, (_, i) =>
            fetchPage(i * 100, 100)
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
                })
        );

        const pages = await Promise.all(tasks);
        const allAssets = pages.flat();

        if (config.printOne && allAssets.length) {
            console.log(allAssets[0]);
        }

        // 2) Filter for profitable candidates
        const candidates = allAssets
            .map(item => {
                const sellPrice = item.price / PRICE_DIVIDER;
                const buyPrice = item.buy_price / PRICE_DIVIDER + PRICE_STEP;
                const proceeds = (sellPrice - PRICE_STEP) * (1 - FEE_RATE);
                const count = Math.floor(config.balance / buyPrice);
                const profit = (proceeds - buyPrice) * count;

                return {
                    hash_name: item.hash_name,
                    name: item.name,
                    buyPrice,
                    sellPrice,
                    number: count,
                    profit,
                };
            })
            .filter(
                i =>
                    i.number > 0 &&
                    i.profit / i.number > config.profit &&
                    i.buyPrice > 0.1 &&
                    !i.name.includes(' key')
            );

        // 3) Enrich with stats
        const barItems = makeBarDrawer(candidates.length, 20, 'Fetching items');
        const enriched = await Promise.all(
            candidates.map(async it => {
                const stats = await fetchItem(it.hash_name);
                const [avgCount, avgValue] = averageStats(stats);
                barItems.tick();
                return {
                    ...it,
                    dailyTx: avgCount,
                    txPrice: avgValue,
                };
            })
        );

        // 4) Score each item
        enriched.forEach(it => {
            it.score = scoreItem({
                dailyTx: it.dailyTx,
                profit: it.profit,
                txPrice: it.txPrice,
                buyPrice: it.buyPrice,
                sellPrice: it.sellPrice,
                number: it.number,
            });
        });

        // 5) Sort
        const sorted = enriched.sort((a, b) => b.score - a.score);

        const cols = ['hash_name', 'buyPrice', 'number', 'profit', 'score'];
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
    } catch (err) {
        console.error(err);
    }
})();
