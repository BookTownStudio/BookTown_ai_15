
import { ChartDataPoint } from '../components/ui/Charts.tsx';

// Helper to generate dates
const getLast7Days = () => {
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d.toLocaleDateString('en-US', { weekday: 'short' });
    });
};

const days = getLast7Days();

export const mockUserGrowthData: ChartDataPoint[] = [
    { label: days[0], value: 120 },
    { label: days[1], value: 135 },
    { label: days[2], value: 128 },
    { label: days[3], value: 142 },
    { label: days[4], value: 156 },
    { label: days[5], value: 189 }, // Weekend bump
    { label: days[6], value: 210 },
];

export const mockAiUsageData: ChartDataPoint[] = [
    { label: days[0], value: 4500 },
    { label: days[1], value: 5200 },
    { label: days[2], value: 4800 },
    { label: days[3], value: 6100 },
    { label: days[4], value: 5900 },
    { label: days[5], value: 8500 },
    { label: days[6], value: 9200 },
];

export const mockContentDistribution = [
    { label: 'Reviews', value: 340, color: '#0077B6' }, // Primary
    { label: 'Posts', value: 890, color: '#90E0EF' },   // Accent
    { label: 'Quotes', value: 520, color: '#F59E0B' },  // Amber
    { label: 'Shelves', value: 150, color: '#10B981' }, // Green
];

export const mockLatencyData: ChartDataPoint[] = [
    { label: '00:00', value: 120 },
    { label: '04:00', value: 115 },
    { label: '08:00', value: 340 }, // Morning spike
    { label: '12:00', value: 280 },
    { label: '16:00', value: 295 },
    { label: '20:00', value: 410 }, // Evening peak
    { label: '23:59', value: 150 },
];

export const mockGeographicData: ChartDataPoint[] = [
    { label: 'USA', value: 45 },
    { label: 'UK', value: 20 },
    { label: 'Canada', value: 15 },
    { label: 'Germany', value: 10 },
    { label: 'Other', value: 10 },
];

// New mocks for Feature Engagement
export const mockFeatureUsageData: ChartDataPoint[] = [
    { label: 'Book Search', value: 8500 },
    { label: 'AI Chat (Librarian)', value: 6200 },
    { label: 'Post Composer', value: 4100 },
    { label: 'Shelf Management', value: 3800 },
    { label: 'Visual Search', value: 2900 },
    { label: 'Writing Editor', value: 1500 },
];

export const mockSessionDurationData: ChartDataPoint[] = [
    { label: '< 1m', value: 15 },
    { label: '1-5m', value: 35 },
    { label: '5-15m', value: 25 },
    { label: '15-30m', value: 15 },
    { label: '> 30m', value: 10 },
];
