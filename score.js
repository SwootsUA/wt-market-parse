function computeMid(buy, sell) {
    return (buy + sell) / 2;
}

function priceProximity(avgValue, mid) {
    if (mid === 0) return 0;
    return Math.max(0, 1 - Math.abs(avgValue - mid) / mid);
}

function scoreItem({dailyTx, profit, txPrice, buyPrice, sellPrice}) {
    const mid = computeMid(buyPrice, sellPrice);
    const prox = priceProximity(txPrice, mid);

    return 0.4 * dailyTx + 0.5 * profit + 0.1 * prox;
}

module.exports = {scoreItem};
