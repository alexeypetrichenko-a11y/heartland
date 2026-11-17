# Browser benchmark (headless Chromium, CPU throttled)

Bundle: 124 KB minified, 40 KB gzip (engine + test world + autopilot, no dependencies).

Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.

| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 326 | 0.58 | 0.51 | 2.0 | 3.7 | 273 | 9.5 |
| 4x | 998 | 1.70 | 1.37 | 8.4 | 15.3 | 273 | 9.5 |
| 6x | 1464 | 2.37 | 2.23 | 12.4 | 23.9 | 273 | 9.5 |

State fingerprint after 672 weeks: cbae27a2ed468a59 (identical at every throttle level).
