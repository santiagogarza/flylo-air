# Lighthouse: before

Production build (`next build && next start`), Lighthouse 13.6.0, 3 runs per page and preset, median run shown.
Measured 2026-10-29T04:18:11.320Z on Chrome/156.0.0.0. Travel date 2026-11-12.

## Mobile

| Page | Perf | A11y | Best Practices | SEO | FCP | LCP | CLS | TBT | Speed Index | JS KB | Total KB | Perf per run |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| Home | 100 | 100 | 96 | 60 | 760 ms | 760 ms | 0.000 | 23 ms | 760 ms | 148.9 | 166.0 | 100, 100, 100 |
| Results | 100 | 100 | 96 | 60 | 756 ms | 756 ms | 0.000 | 24 ms | 756 ms | 148.9 | 173.6 | 100, 100, 100 |
| Checkout | 100 | 100 | 96 | 60 | 754 ms | 754 ms | 0.000 | 46 ms | 754 ms | 152.0 | 166.5 | 100, 100, 100 |
| Support (measure only) | 100 | 100 | 96 | 60 | 905 ms | 905 ms | 0.000 | 23 ms | 905 ms | 147.0 | 161.1 | 100, 100, 100 |

## Desktop

| Page | Perf | A11y | Best Practices | SEO | FCP | LCP | CLS | TBT | Speed Index | JS KB | Total KB | Perf per run |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --: | --- |
| Home | 100 | 100 | 96 | 60 | 205 ms | 205 ms | 0.000 | 0 ms | 205 ms | 148.9 | 169.9 | 100, 100, 100 |
| Results | 100 | 100 | 96 | 60 | 206 ms | 206 ms | 0.000 | 0 ms | 206 ms | 148.9 | 178.1 | 100, 100, 100 |
| Checkout | 100 | 100 | 96 | 60 | 205 ms | 205 ms | 0.000 | 0 ms | 205 ms | 152.0 | 166.5 | 100, 100, 100 |
| Support (measure only) | 100 | 100 | 96 | 60 | 247 ms | 247 ms | 0.000 | 0 ms | 247 ms | 147.0 | 161.1 | 100, 100, 100 |

Pages:

- Home: `/`
- Results: `/results?from=SFO&to=JFK&date=2026-11-12&passengers=1`
- Checkout: `/checkout?flight=SFO-JFK-2026-11-12-0&fare=basic&passengers=1`
- Support (measure only): `/support/`
