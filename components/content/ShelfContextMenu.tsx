import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import Button from '../ui/Button.tsx';
import { EditIcon } from '../icons/EditIcon.tsx';
import { BookPlusIcon } from '../icons/BookPlusIcon.tsx';
import { ViewListIcon } from '../icons/ViewListIcon.tsx';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { DuplicateIcon } from '../icons/DuplicateIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';

interface ShelfContextMenuProps {
    onAddBook?: () => void;
    onEdit?: () => void;
    onToggleLayout: () => void;
    onShare: () => void;
    onDelete?: () => void;
    onClose: () => void;
    isRTL: boolean;
    isDeletable: boolean;
}

const ShelfContextMenu: React.FC<ShelfContextMenuProps> = ({ 
    onAddBook, 
    onEdit, 
    onToggleLayout,
    onShare,
    onDelete,
    onClose, 
    isRTL, 
    isDeletable 
}) => {
    const { lang } = useI18n();

    const menuItems = [
        { labelEn: 'Edit', labelAr: 'تعديل', icon: EditIcon, action: onEdit, isDestructive: false },
        { labelEn: 'Add Book', labelAr: 'إضافة كتاب', icon: BookPlusIcon, action: onAddBook, isDestructive: false },
        { labelEn: 'Toggle Layout', labelAr: 'تبديل التخطيط', icon: ViewListIcon, action: onToggleLayout, isDestructive: false },
        { labelEn: 'Share', labelAr: 'مشاركة', icon: ShareIcon, action: onShare, isDestructive: false },
        { labelEn: 'Duplicate', labelAr: 'تكرار', icon: DuplicateIcon, action: () => console.log('Duplicate Shelf'), isDestructive: false },
    ];

    if (isDeletable) {
        menuItems.push({ labelEn: 'Delete Shelf', labelAr: 'حذف الرف', icon: TrashIcon, action: onDelete, isDestructive: true });
    }

    return (
        <div 
            className={`absolute top-full z-30 mt-2 w-56 ${isRTL ? 'left-0' : 'right-0'}`}
        >
            <GlassCard className="!p-2">
                <ul className="space-y-1">
                    {menuItems.filter(item => !!item.action).map((item, index) => (
                        <li key={index}>
                            <Button 
                                variant="ghost" 
                                className={`w-full !justify-start !text-inherit !font-normal !px-3 ${item.isDestructive ? '!text-red-400 hover:!bg-red-500/10' : ''}`}
                                onClick={() => { item.action!(); onClose(); }}
                            >
                                <item.icon className={`h-5 w-5 ${isRTL ? 'ml-3' : 'mr-3'}`} />
                                {lang === 'en' ? item.labelEn : item.labelAr}
                            </Button>
                        </li>
                    ))}
                </ul>
            </GlassCard>
        </div>
    );
};

export default ShelfContextMenu;