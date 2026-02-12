
import { useMutation } from '../react-query.ts';
import { identifyBookFromImage, analyzeShelfVibe } from '../../services/geminiService.ts';

export const useIdentifyBook = () => {
    return useMutation({
        mutationFn: (base64Image: string) => identifyBookFromImage(base64Image),
    });
};

export const useAnalyzeShelfVibe = () => {
    return useMutation({
        mutationFn: (bookTitles: string[]) => analyzeShelfVibe(bookTitles),
    });
};
