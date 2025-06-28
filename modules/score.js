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

    return dailyTx * ((perItemProfit + 1) ** 5 * 2) * prox;
}
module.exports = {scoreItem};
