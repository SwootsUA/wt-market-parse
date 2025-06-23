import matplotlib.pyplot as plt
from datetime import datetime, timezone
import sys
import numpy as np

def read_balance_log(filepath):
    """
    Reads a log file where each line contains a timestamp (ms since epoch) and a value,
    separated by ':' or whitespace.
    Returns two lists: list of datetime objects and list of float values.
    """
    times = []
    values = []
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            # Split on colon or whitespace
            parts = None
            if ':' in line:
                parts = line.split(':', 1)
            else:
                parts = line.split(None, 1)
            if len(parts) != 2:
                continue
            ts_str, val_str = parts
            try:
                ts = int(ts_str)
                val = float(val_str)
            except ValueError:
                continue
            # Convert ms timestamp to datetime
            dt = datetime.fromtimestamp(ts / 1000.0)
            times.append(dt)
            values.append(val)
    return times, values


def plot_balance(times, values):
    plt.figure(figsize=(10, 6))
    plt.plot(times, values, marker='o', linestyle='-')
    plt.title('Balance Over Time')
    plt.xlabel('Time')
    plt.ylabel('Balance')
    plt.grid(True)
    plt.gcf().autofmt_xdate()
    plt.tight_layout()
    plt.show()

def plot_balance_with_exponential_fit(timestamps, balances, zoom_days=None, title_suffix=""):
    # Normalize timestamps
    if isinstance(timestamps[0], datetime):
        ts_ms = np.array([int(t.timestamp() * 1000) for t in timestamps], dtype=np.float64)
    else:
        ts_ms = np.array(timestamps, dtype=np.float64)

    vals = np.array(balances, dtype=np.float64)

    # Compute days since first timestamp
    t0 = ts_ms[0]
    days = (ts_ms - t0) / (1000 * 3600 * 24)

    # Exponential fit
    ln_vals = np.log(vals)
    r, lnA = np.polyfit(days, ln_vals, 1)
    A = np.exp(lnA)

    # Prediction horizon
    T_pred = np.log(100 / A) / r
    max_days = zoom_days if zoom_days is not None else T_pred

    # Fit curve
    t_fit = np.linspace(0, max_days, 200)
    s_fit = A * np.exp(r * t_fit)

    # Plot
    plt.figure()
    plt.scatter(days, vals, label="Data Points")
    plt.plot(t_fit, s_fit, label="Exponential Fit")
    if zoom_days is not None:
        plt.xlim(0, zoom_days)

    # Use timezone-aware datetime for the label
    start_label = datetime.fromtimestamp(t0/1000, tz=timezone.utc).strftime('%b %d, %Y UTC')
    plt.xlabel(f'Days since {start_label}')
    plt.ylabel('Balance')
    plt.title(f'Balance over Time with Exponential Fit {title_suffix}')
    plt.legend()
    plt.tight_layout()
    plt.show()

def main():
    if len(sys.argv) != 2:
        filepath = 'balance.log'
    else:
        filepath = sys.argv[1]
    
    times, values = read_balance_log(filepath)

    if not times:
        print("No data found in the log file.")
        sys.exit(1)

    plot_balance(times, values)
    plot_balance_with_exponential_fit(times, values)

if __name__ == '__main__':
    main()
