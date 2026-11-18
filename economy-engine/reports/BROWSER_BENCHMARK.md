# Browser benchmark (headless Chromium, CPU throttled)

Bundle: 133 KB minified, 43 KB gzip (engine + test world + autopilot, no dependencies).

Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.

| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 400 | 0.73 | 0.31 | 1.7 | 3.4 | 274 | 9.5 |
| 4x | 1343 | 2.19 | 2.28 | 10.5 | 21.4 | 274 | 9.5 |
| 6x | 1641 | 2.87 | 1.72 | 10.5 | 18.1 | 274 | 9.5 |

State fingerprint after 672 weeks: ef7dfc948cbe33b0 (identical at every throttle level).
