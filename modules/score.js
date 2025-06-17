function computeMid(buy, sell) {
    return (buy + sell) / 2;
}

function priceProximity(avgValue, mid) {
    if (mid === 0) return 0;
    return Math.max(0, 1 - Math.abs(avgValue - mid) / mid);
}

function scoreItem({dailyTx, perItemProfit, txPrice, buyPrice, sellPrice}) {
    const mid = computeMid(buyPrice, sellPrice);
    const prox = priceProximity(txPrice, mid);

    return dailyTx ** 2 * ((perItemProfit + 1) ** 3 / 2) * prox ** 2;
}
module.exports = {scoreItem};
