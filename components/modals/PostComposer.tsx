
import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';

interface PostComposerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PostComposerModal: React.FC<PostComposerModalProps> = ({ isOpen, onClose }) => {
    const { lang } = useI18n();
    const [text, setText] = useState('');

    const handlePost = () => {
        // Placeholder action
        console.log('Posting from modal:', text);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full">
                <BilingualText role="H1" className="!text-xl mb-4">
                    {lang === 'en' ? 'New Post' : 'منشور جديد'}
                </BilingualText>
                
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={lang === 'en' ? "What's happening?" : 'ماذا يحدث؟'}
                    className="w-full h-32 bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md p-3 text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                />

                <div className="mt-4 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                    <Button variant="primary" onClick={handlePost} disabled={!text.trim()}>
                        {lang === 'en' ? 'Post' : 'نشر'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default PostComposerModal;
