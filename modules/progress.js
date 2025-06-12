function makeBarDrawer(total, width = 20, label = 'Progress') {
    let i = 0;
    return {
        tick() {
            i++;
            const pct = i / total;
            const filled = Math.round(pct * width);
            const bar = `${label}: [${'#'.repeat(filled)}${'.'.repeat(
                width - filled
            )}] ${Math.round(pct * 100)}%`;
            process.stdout.write(`\r${bar}`);
            if (i === total) process.stdout.write('\n');
        },
    };
}

module.exports = {makeBarDrawer};
