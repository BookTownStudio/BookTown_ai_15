import React from 'react';
import Modal from '../ui/Modal.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { User } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';

interface ProfileConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  users: User[] | undefined;
  isLoading: boolean;
  emptyLabel: string;
  onSelectUser: (user: User) => void;
}

const buildFallbackAvatar = (uid: string) =>
  `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid || 'booktown-user'}`;

const ProfileConnectionsModal: React.FC<ProfileConnectionsModalProps> = ({
  isOpen,
  onClose,
  title,
  users,
  isLoading,
  emptyLabel,
  onSelectUser,
}) => {
  const { lang } = useI18n();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <div className="pr-10">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
        </div>

        {isLoading ? (
          <div className="flex min-h-[180px] items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : users && users.length > 0 ? (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {users.map((user) => (
              <button
                key={user.uid}
                type="button"
                onClick={() => onSelectUser(user)}
                className="flex w-full items-center gap-3 rounded-2xl border border-black/5 bg-white/70 px-3 py-3 text-left transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-slate-900/50 dark:hover:bg-white/5"
              >
                <img
                  src={user.avatarUrl || buildFallbackAvatar(user.uid)}
                  alt={user.name}
                  className="h-12 w-12 rounded-full object-cover"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = buildFallbackAvatar(user.uid);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {user.name}
                  </div>
                  <div className="truncate text-sm text-slate-500 dark:text-slate-400">
                    {user.handle}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-black/10 px-6 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
            {emptyLabel}
          </div>
        )}

        <div className="text-xs text-slate-400 dark:text-slate-500">
          {lang === 'en'
            ? 'Select a profile to open it.'
            : 'اختر ملفًا شخصيًا لفتحه.'}
        </div>
      </div>
    </Modal>
  );
};

export default ProfileConnectionsModal;
