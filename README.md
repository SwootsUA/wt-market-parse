# Market Profits Finder

A Node.js script to discover profitable items on the Gaijin market.

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/SwootsUA/wt-market-parse.git
   cd wt-market-parse
   ```
2. Create a `.env` file in the project root:

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
node index.js [options]
```

Options:
-   `--help` Show help (optional)
-   `--pages, -p` Number of pages to fetch (default: 5)
-   `--profit, -r` Minimum profit per item (default: 0.1)
-   `--balance, -b` Your account balance (default: 1.00)
-   `--top, -t` Number of top items to display by score (default: 10)
-   `--print, -i` Print the first item fetched (optional)
-   `--debug, -D` Print out warnings during execution (optional)
-   `--show-name, -n` Include item names in the final output table (optional)
-   `--all-info, -a` Include all enriched data in the final table (optional)
-   `--deals, -d` Switch to deals mode, that shows user open orders (optional)
-   `--with-trophy, -w` Include trophy orders into deals mode (optional)
-   `--bot` Format deals mode output to fit bot needs (optional) 

## Examples

Fetch 2 pages, require at least 0.2 profit, balance 5.00, show top 15 without names:

```bash
node index.js -p 2 -r 0.2 -b 5 -t 15
```

Fetch 3 pages, show full enriched info for top 5:

```bash
node index.js --pages 3 --top 5 --all-info
```
