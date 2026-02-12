
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';

export const usePartnerAnalytics = () => {
    return useQuery({
        queryKey: ['partnerAnalytics'],
        queryFn: () => dataService.partner.getAnalytics(),
    });
};
