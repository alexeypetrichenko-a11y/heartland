# Browser benchmark (headless Chromium, CPU throttled)

Bundle: 150 KB minified, 48 KB gzip (engine + test world + autopilot, no dependencies).

Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.

| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 322 | 0.53 | 0.28 | 1.4 | 3.2 | 277 | 9.5 |
| 4x | 818 | 1.43 | 1.32 | 7.0 | 11.9 | 277 | 9.5 |
| 6x | 1280 | 1.92 | 2.33 | 15.2 | 30.6 | 277 | 9.5 |

State fingerprint after 672 weeks: 6f9bf1a361044b05 (identical at every throttle level).
