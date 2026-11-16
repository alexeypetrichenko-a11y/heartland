# Browser benchmark (headless Chromium, CPU throttled)

Bundle: 109 KB minified, 36 KB gzip (engine + test world + autopilot, no dependencies).

Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.

| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 310 | 0.59 | 0.38 | 2.3 | 4.6 | 266 | 9.5 |
| 4x | 788 | 1.30 | 1.71 | 10.0 | 15.0 | 266 | 9.5 |
| 6x | 1105 | 1.67 | 1.36 | 8.7 | 15.6 | 266 | 9.5 |

State fingerprint after 672 weeks: 6202f97a08efb829 (identical at every throttle level).
