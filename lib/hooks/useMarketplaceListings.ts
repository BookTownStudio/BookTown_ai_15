
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';

export const useMarketplaceListings = () => {
    return useQuery({
        queryKey: ['marketplace'],
        queryFn: () => dataService.marketplace.getListings(),
    });
};
