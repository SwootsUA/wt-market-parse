const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');
const {alias, describe} = require('yargs');

module.exports = () => {
    const argv = yargs(hideBin(process.argv))
        .usage('Usage: $0 [options]')
        .options({
            pages: {
                alias: 'p',
                type: 'number',
                default: 1,
                describe: 'Number of item pages to fetch',
            },
            profit: {
                alias: 'r',
                type: 'number',
                default: 0.1,
                describe: 'Minimum profit required per item',
            },
            balance: {
                alias: 'b',
                type: 'number',
                default: 1.0,
                describe: 'Your available balance',
            },
            top: {
                alias: 't',
                type: 'number',
                default: 10,
                describe: 'Number of top items to display by score',
            },
            print: {
                alias: 'i',
                type: 'boolean',
                default: false,
                describe: 'Print the first item fetched fully',
            },
            debug: {
                alias: 'D',
                type: 'boolean',
                default: false,
                describe: 'Print out warnings during script execution',
            },
            'show-name': {
                alias: 'n',
                type: 'boolean',
                default: false,
                describe: 'Add name to the final table',
            },
            'all-info': {
                alias: 'a',
                type: 'boolean',
                default: false,
                describe: 'Print all data in final table',
            },
            deals: {
                alias: 'd',
                type: 'boolean',
                default: false,
                describe: 'Switch to deals mode',
            },
            'with-trophy': {
                alias: 'w',
                type: 'boolean',
                default: false,
                describe: 'Include trophy into deals list'
            }
            bot: {
                type: 'boolean',
                default: false,
                describe: 'Change some outputs for tg bot'
            }
        })
        .check(o => {
            if ([o.pages, o.profit, o.balance, o.top].some(isNaN))
                throw new Error('Invalid numeric input');
            return true;
        })
        .help().argv;

    return {
        pages: argv.pages,
        profit: argv.profit,
        balance: argv.balance,
        top: argv.top,
        printOne: argv.print,
        debug: argv.debug,
        showName: argv.showName,
        allInfo: argv.allInfo,
        deals: argv.deals,
        withTrophy: argv.withTrophy,
        bot: argv.bot,
    };
};
