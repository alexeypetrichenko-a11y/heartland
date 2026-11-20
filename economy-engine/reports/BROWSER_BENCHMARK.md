# Browser benchmark (headless Chromium, CPU throttled)

Bundle: 149 KB minified, 48 KB gzip (engine + test world + autopilot, no dependencies).

Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.

| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 313 | 0.79 | 0.56 | 1.9 | 4.9 | 277 | 9.5 |
| 4x | 1059 | 1.80 | 1.43 | 6.7 | 14.3 | 277 | 9.5 |
| 6x | 1302 | 2.16 | 1.92 | 10.1 | 20.5 | 277 | 9.5 |

State fingerprint after 672 weeks: 6f9bf1a361044b05 (identical at every throttle level).
