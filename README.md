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
   npm install dotenv
   ```

## Usage

```bash
node index.js [PAGES] [PROFIT] [PRINT] [BALANCE]
```

* `PAGES` — number of pages (100 items each), default: `1`
* `PROFIT` — minimum profit per item, default: `0.1`
* `PRINT` — `true` to log the first item, default: `false`
* `BALANCE` — maximum buy price you can afford, default: `1.00`

### Example

```bash
node index.js 2 0.2 false 5.00
```

