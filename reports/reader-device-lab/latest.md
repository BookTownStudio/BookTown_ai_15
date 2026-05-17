# Reader Device-Lab Proxy Report

Generated: 2026-05-17T15:26:51.415Z

## Evidence Boundary

This is a local Playwright Chromium proxy with CPU throttling, route delay, corpus fixtures, interaction loops, heap samples, and reader telemetry. It is not a physical low-end-device, battery, or thermal lab.

## Scenario Summary

| Scenario | Format | Cold open | First page | Long tasks | Layout shift | Hydration delay | Prewarm | Heap growth | Findings |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| weak_device_large_pdf | pdf | 302.3ms | 302.3ms | 9 | 0.0333 | 44.7ms | 1 | 0.00MB | 0 |
| weak_device_huge_pagecount_pdf | pdf | 8119.7ms | 8119.7ms | 8 | 0 | 35ms | 1 | 0.00MB | 0 |
| weak_network_large_pdf | pdf | 1340.2ms | 1340.2ms | 4 | 0.0728 | 121.6ms | 1 | 0.00MB | 0 |
| large_epub_location_cache | epub | 240.2ms | 240.2ms | 10 | 0 | 0ms | 1 | 0.00MB | 0 |
| rtl_arabic_epub | epub | 250.8ms | 250.8ms | 7 | 0 | 0ms | 1 | 0.00MB | 0 |
| mixed_rtl_ltr_epub | epub | 224.7ms | 224.7ms | 6 | 0 | 0ms | 1 | 0.00MB | 0 |
| annotation_heavy_epub | epub | 234.5ms | 234.5ms | 8 | 0 | 0ms | 1 | 0.00MB | 0 |

## Findings

No P1/P2 findings in the local proxy run.

## Remaining Physical-Lab Gaps

- Battery pressure and thermal slowdown were not measured in this environment.
- Mobile OS background eviction and tab sleep behavior require physical or cloud-device validation.
- Four-hour endurance is represented here only by accelerated interaction loops, not wall-clock evidence.
