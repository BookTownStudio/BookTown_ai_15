
import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose }) => {
    const { lang } = useI18n();

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="text-center">
                <BilingualText role="H1" className="!text-2xl">
                    {lang === 'en' ? 'Unlock Premium Agents' : 'افتح المساعدين المميزين'}
                </BilingualText>
                <BilingualText role="Body" className="mt-4 text-white/70">
                    {lang === 'en' ? 'Upgrade to a Pro plan to get access to specialized AI agents, unlimited projects, and more.' : 'قم بالترقية إلى خطة Pro للوصول إلى مساعدي الذكاء الاصطناعي المتخصصين ومشاريع غير محدودة والمزيد.'}
                </BilingualText>
                <Button variant="primary" className="mt-6 w-full">
                    {lang === 'en' ? 'Upgrade Now' : 'الترقية الآن'}
                </Button>
            </div>
        </Modal>
    );
};

export default UpgradeModal;
