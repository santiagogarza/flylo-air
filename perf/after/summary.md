# Lighthouse: after

Production build (`next build && next start`), Lighthouse 13.6.0, 3 runs per page and preset, median run shown.
Measured 2026-10-29T04:29:51.264Z on Chrome/156.0.0.0. Travel date 2026-11-12.

## Mobile

| Page | Perf | A11y | Best Practices | SEO | FCP | LCP | CLS | TBT | Speed Index | JS KB | Total KB | Perf per run |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| Home | 100 | 100 | 100 | 60 | 755 ms | 755 ms | 0.000 | 25 ms | 755 ms | 140.5 | 154.7 | 100, 100, 100 |
| Results | 100 | 100 | 100 | 60 | 757 ms | 757 ms | 0.000 | 24 ms | 757 ms | 140.5 | 162.6 | 100, 100, 100 |
| Checkout | 100 | 100 | 100 | 60 | 755 ms | 755 ms | 0.000 | 49 ms | 755 ms | 143.6 | 155.6 | 100, 100, 100 |
| Support (measure only) | 100 | 100 | 100 | 60 | 906 ms | 906 ms | 0.000 | 63 ms | 906 ms | 147.1 | 158.6 | 100, 100, 100 |

## Desktop

| Page | Perf | A11y | Best Practices | SEO | FCP | LCP | CLS | TBT | Speed Index | JS KB | Total KB | Perf per run |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| Home | 100 | 100 | 100 | 60 | 205 ms | 205 ms | 0.000 | 0 ms | 205 ms | 140.5 | 158.5 | 100, 100, 100 |
| Results | 100 | 100 | 100 | 60 | 206 ms | 206 ms | 0.000 | 0 ms | 206 ms | 140.5 | 167.9 | 100, 100, 100 |
| Checkout | 100 | 100 | 100 | 60 | 205 ms | 205 ms | 0.000 | 0 ms | 205 ms | 143.6 | 156.0 | 100, 100, 100 |
| Support (measure only) | 100 | 100 | 100 | 60 | 250 ms | 250 ms | 0.000 | 0 ms | 250 ms | 147.1 | 161.8 | 100, 100, 100 |

Pages:

- Home: `/`
- Results: `/results?from=SFO&to=JFK&date=2026-11-12&passengers=1`
- Checkout: `/checkout?flight=SFO-JFK-2026-11-12-0&fare=basic&passengers=1`
- Support (measure only): `/support/`
