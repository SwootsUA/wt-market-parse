require('dotenv').config();
const config = require('./cli')();

const TOKEN = process.env.WT_TOKEN;
const PAGE_SIZE = 100;

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

async function fetchItem(item, debug) {
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
        if (debug) {
            console.error(`Bad item ${item}: ${error}, ${res}`);
        }
        return [[0, 0, 0]];
    }
    if (!payload.response || !payload.response['1h']) {
        if (debug) {
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

async function fetchUserDeals() {
    const params = new URLSearchParams({
        action: 'cln_get_user_open_orders',
        token: TOKEN,
    });

    const res = await fetch('https://market-proxy.gaijin.net/web', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
        },
        body: params.toString(),
    });

    if (!res.ok) {
        if (config.debug)
            console.error('HTTP error', res.status, res.statusText);
        return [];
    }

    let data;
    try {
        data = await res.json();
    } catch (err) {
        if (config.debug) console.error('Invalid JSON', err);
        return [];
    }

    if (!Array.isArray(data.response)) {
        if (config.debug) console.error('Unexpected payload shape', data);
        return [];
    }

    return data.response;
}

async function placeMarketBuy(marketName, amount, price) {
    const params = new URLSearchParams({
        action: 'cln_market_buy',
        token: TOKEN,
        appid: 1067,
        market_name: marketName,
        amount: amount,
        price: price,
        currencyid: 'gjn',
        agree_stamp: Date.now(),
    });

    const res = await fetch('https://market-proxy.gaijin.net/web', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
        },
        body: params.toString(),
    });

    const payload = await res.json().catch(err => {
        if (config.debug)
            console.error('placeMarketBuy > invalid JSON', err, res);
        throw err;
    });

    if (!payload.response) {
        throw new Error(
            `placeMarketBuy bad payload: ${JSON.stringify(payload)}`
        );
    }

    return payload.response;
}

async function placeMarketSell(
    contextId,
    assetId,
    amount,
    price,
    sellerShouldGet
) {
    const params = new URLSearchParams({
        action: 'cln_market_sell',
        token: TOKEN,
        appid: 1067,
        contextid: contextId,
        assetid: assetId,
        amount: amount,
        price: price,
        seller_should_get: sellerShouldGet,
        currencyid: 'gjn',
        agree_stamp: Date.now(),
    });

    const res = await fetch('https://market-proxy.gaijin.net/web', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
        },
        body: params.toString(),
    });

    const payload = await res.json().catch(err => {
        if (config.debug)
            console.error('placeMarketSell > invalid JSON', err, res);
        throw err;
    });

    if (!payload.response) {
        throw new Error(
            `placeMarketSell bad payload: ${JSON.stringify(payload)}`
        );
    }

    return payload.response;
}

async function cancelOrder(txId, pairId, orderId) {
    const params = new URLSearchParams({
        action: 'cancel_order',
        token: TOKEN,
        transactid: txId,
        pairId: pairId,
        orderId: orderId,
        reqstamp: Date.now(),
    });

    const res = await fetch('https://market-proxy.gaijin.net/web', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json, text/plain, */*',
        },
        body: params.toString(),
    });

    const payload = await res.json().catch(err => {
        if (config.debug) console.error('cancelOrder > invalid JSON', err, res);
        throw err;
    });

    if (!payload.response) {
        throw new Error(`cancelOrder bad payload: ${JSON.stringify(payload)}`);
    }

    return payload.response;
}

module.exports = {
    fetchPage,
    fetchItem,
    fetchUserDeals,
    placeMarketBuy,
    placeMarketSell,
    cancelOrder,
};
