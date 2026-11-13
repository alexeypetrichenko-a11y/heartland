# Browser benchmark (headless Chromium, CPU throttled)

Bundle: 91 KB minified, 30 KB gzip (engine + test world + autopilot, no dependencies).

Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.

| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 167 | 0.26 | 0.23 | 1.6 | 4.7 | 256 | 9.5 |
| 4x | 574 | 0.69 | 0.78 | 7.7 | 9.9 | 256 | 9.5 |
| 6x | 776 | 1.19 | 1.60 | 22.1 | 27.6 | 256 | 9.5 |

State fingerprint after 672 weeks: 61f628925444b0e0 (identical at every throttle level).
