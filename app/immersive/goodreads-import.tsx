import React, { useState, useRef } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import Button from '../../components/ui/Button.tsx';
import { UploadIcon } from '../../components/icons/UploadIcon.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { useGoodreadsImport } from '../../lib/hooks/useGoodreadsImport.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';

const GoodreadsImportScreen: React.FC = () => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const { mutate: startImport, isLoading, isSuccess, error, data: stats } = useGoodreadsImport();

    const handleBack = () => {
        if (currentView.params?.from) {
            navigate(currentView.params.from);
        } else {
            navigate({ type: 'drawer', id: 'settings' });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
        }
    };

    const handleUpload = () => {
        if (file) {
            startImport(file);
        }
    };

    const renderContent = () => {
        if (isSuccess && stats) {
            return (
                <div className="text-center space-y-6 animate-fade-in-up">
                    <CheckCircleIcon className="w-24 h-24 text-green-500 mx-auto" />
                    <BilingualText role="H1" className="!text-2xl">
                        {lang === 'en' ? 'Import Successful!' : 'تم الاستيراد بنجاح!'}
                    </BilingualText>
                    <div className="bg-white/5 rounded-lg p-6 max-w-sm mx-auto border border-white/10">
                        <div className="grid grid-cols-2 gap-4 text-left">
                            <BilingualText role="Caption">{lang === 'en' ? 'Books:' : 'الكتب:'}</BilingualText>
                            <span className="font-bold text-right">{stats.booksImported}</span>
                            
                            <BilingualText role="Caption">{lang === 'en' ? 'Shelves:' : 'الرفوف:'}</BilingualText>
                            <span className="font-bold text-right">{stats.shelvesCreated}</span>
                            
                            <BilingualText role="Caption">{lang === 'en' ? 'Reviews:' : 'المراجعات:'}</BilingualText>
                            <span className="font-bold text-right">{stats.reviewsImported}</span>
                        </div>
                    </div>
                    <Button variant="primary" onClick={handleBack} className="w-full max-w-xs">
                        {lang === 'en' ? 'Done' : 'تم'}
                    </Button>
                </div>
            );
        }

        return (
            <div className="space-y-8 animate-fade-in-up">
                <div className="text-center">
                    <BilingualText role="Body" className="text-white/70 max-w-lg mx-auto">
                        {lang === 'en' 
                            ? 'Upload your Goodreads export file (CSV or ZIP). We will import your shelves, ratings, reviews, and reading history.' 
                            : 'قم بتحميل ملف تصدير Goodreads (CSV أو ZIP). سنقوم باستيراد رفوفك وتقييماتك ومراجعاتك وسجل القراءة.'}
                    </BilingualText>
                </div>

                <div 
                    className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${file ? 'border-accent bg-accent/5' : 'border-slate-600 hover:border-slate-400 hover:bg-white/5'}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".csv,.xml,.zip" 
                        className="hidden" 
                    />
                    
                    {file ? (
                        <>
                            <div className="bg-slate-800 p-4 rounded-full mb-4">
                                <UploadIcon className="w-8 h-8 text-accent" />
                            </div>
                            <p className="font-semibold text-white truncate max-w-[200px]">{file.name}</p>
                            <p className="text-sm text-slate-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            <Button variant="ghost" className="mt-4 !text-red-400 hover:!bg-red-500/10" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                                {lang === 'en' ? 'Remove' : 'إزالة'}
                            </Button>
                        </>
                    ) : (
                        <>
                            <UploadIcon className="w-12 h-12 text-slate-500 mb-4" />
                            <BilingualText className="font-semibold">
                                {lang === 'en' ? 'Click to upload or drag and drop' : 'انقر للتحميل أو اسحب وأفلت'}
                            </BilingualText>
                            <BilingualText role="Caption" className="mt-2">
                                CSV, XML, ZIP
                            </BilingualText>
                        </>
                    )}
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-lg text-center">
                        <BilingualText className="text-red-400">
                            {lang === 'en' ? 'Import failed. Please try again.' : 'فشل الاستيراد. يرجى المحاولة مرة أخرى.'}
                        </BilingualText>
                    </div>
                )}

                <div className="flex justify-center">
                    <Button 
                        variant="primary" 
                        onClick={handleUpload} 
                        disabled={!file || isLoading}
                        className="w-full max-w-xs !h-12 !text-lg"
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-2">
                                <LoadingSpinner /> 
                                <span>{lang === 'en' ? 'Importing...' : 'جار الاستيراد...'}</span>
                            </div>
                        ) : (
                            lang === 'en' ? 'Start Import' : 'بدء الاستيراد'
                        )}
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Goodreads Importer" titleAr="استيراد جودريدز" onBack={handleBack} />
            <main className="flex-grow pt-24 pb-8 overflow-y-auto">
                <div className="container mx-auto px-4 md:px-8">
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default GoodreadsImportScreen;
