function computeMid(buy, sell) {
    return (buy + sell) / 2;
}

function priceProximity(avgValue, mid) {
    if (mid === 0) return 0;
    return Math.max(0, 1 - Math.abs(avgValue - mid) / mid);
}

function scoreItem({dailyTx, profit, txPrice, buyPrice, sellPrice, number}) {
    const mid = computeMid(buyPrice, sellPrice);
    const prox = priceProximity(txPrice, mid);

    return 0.4 * dailyTx + 0.6 * profit + 0.2 * prox - 0.2 * number;
}

module.exports = {scoreItem};
