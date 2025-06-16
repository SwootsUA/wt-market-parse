const EPOCH_MULTIPLIER = 1_000;
const ITEM_PRICE_DIVIDER = 10_000;

function roundTo(n, p) {
    return Math.round(n * 10 ** p) / 10 ** p;
}

function averageStats(transact) {
    if (!transact.length) return [0, 0];
    const timeSpanSec = transact[transact.length - 1][0] - transact[0][0];
    const totalValue = transact.reduce((acc, cur) => acc + cur[1], 0);
    const totalCount = transact.reduce((acc, cur) => acc + cur[2], 0);
    const secondsPerDay = 86400000 / EPOCH_MULTIPLIER;
    const daysSpan = timeSpanSec / secondsPerDay;
    const avgTransactCount = totalCount / (daysSpan || 30);
    const avgTransactValue = roundTo(
        totalValue / totalCount / ITEM_PRICE_DIVIDER,
        3
    );
    return [avgTransactCount, avgTransactValue];
}

module.exports = {averageStats};
