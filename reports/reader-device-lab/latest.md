# Reader Device-Lab Proxy Report

Generated: 2026-05-17T11:51:10.378Z

## Evidence Boundary

This is a local Playwright Chromium proxy with CPU throttling, route delay, corpus fixtures, interaction loops, heap samples, and reader telemetry. It is not a physical low-end-device, battery, or thermal lab.

## Scenario Summary

| Scenario | Format | Cold open | First page | Long tasks | Layout shift | Hydration delay | Prewarm | Heap growth | Findings |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| weak_device_large_pdf | pdf | 192.1ms | 191.9ms | 8 | 0.0173 | 71.6ms | 1 | 0.00MB | 0 |
| weak_device_huge_pagecount_pdf | pdf | 8393.5ms | 8393.5ms | 8 | 0.0041 | 10.1ms | 1 | 0.00MB | 0 |
| weak_network_large_pdf | pdf | 1331.5ms | 1331.5ms | 4 | 0.0306 | 14.7ms | 1 | 0.00MB | 0 |
| large_epub_location_cache | epub | 249.7ms | 249.7ms | 10 | 0 | 0ms | 1 | 0.00MB | 0 |
| rtl_arabic_epub | epub | 214.1ms | 214.1ms | 6 | 0 | 0ms | 1 | 0.00MB | 0 |
| mixed_rtl_ltr_epub | epub | 222.3ms | 222.3ms | 6 | 0 | 0ms | 1 | 0.00MB | 0 |
| annotation_heavy_epub | epub | 221.4ms | 221.4ms | 8 | 0 | 0ms | 1 | 0.00MB | 0 |

## Findings

No P1/P2 findings in the local proxy run.

## Remaining Physical-Lab Gaps

- Battery pressure and thermal slowdown were not measured in this environment.
- Mobile OS background eviction and tab sleep behavior require physical or cloud-device validation.
- Four-hour endurance is represented here only by accelerated interaction loops, not wall-clock evidence.
