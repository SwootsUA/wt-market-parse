# Market Profits Finder

A simple script to find profitable items on the Gaijin market.

## Setup

1. Copy `index.js` into a folder.
2. Create a `.env` file in the same folder:

   ```dotenv
   WT_TOKEN=your_token_here
   ```
3. Install dependencies:

   ```bash
   npm init -y
   npm install dotenv yargs
   ```

## Usage

```bash
node index.js --pages <num> --profit <num> --balance <num> --top <num> [--print]
```

* `--pages, -p`      Number of pages to fetch (default: 1)
* `--profit, -r`     Minimum profit per item (default: 0.1)
* `--balance, -b`    Maximum buy price you can afford (default: 1.00)
* `--top, -t`        Number of top items to display by score (default: 10)
* `--print, -i`      Print the first item fetched (optional)

## Example

```bash
# fetch 2 pages, require at least 0.2 profit, balance 5.00, show top 15
node index.js -p 2 -r 0.2 -b 5.00 -t 15
```
