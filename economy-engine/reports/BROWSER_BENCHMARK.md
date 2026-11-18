# Browser benchmark (headless Chromium, CPU throttled)

Bundle: 149 KB minified, 48 KB gzip (engine + test world + autopilot, no dependencies).

Nine countries, eleven zones, seven goods; 520 simulated weeks after a 100-week warm-up. Chromium is not Safari: this is an order-of-magnitude proxy for a phone, not a device measurement.

| CPU throttle | build world (ms) | ms / week (no report) | ms / week (full report) | save (ms) | restore (ms) | save size (KB) | JS heap in use (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1x | 480 | 0.95 | 0.57 | 2.2 | 3.8 | 277 | 9.5 |
| 4x | 1298 | 2.35 | 2.67 | 8.2 | 19.9 | 277 | 9.5 |
| 6x | 1923 | 2.87 | 4.78 | 17.4 | 22.8 | 277 | 9.5 |

State fingerprint after 672 weeks: 6f9bf1a361044b05 (identical at every throttle level).
