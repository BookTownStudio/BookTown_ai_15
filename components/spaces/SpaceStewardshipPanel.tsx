import React, { useEffect, useMemo, useState } from 'react';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import SpaceRelationshipCurationField, { CuratedSpaceRelationshipRefs } from './SpaceRelationshipCurationField.tsx';
import EditVenueModal from '../modals/EditVenueModal.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useUpdateVenue } from '../../lib/hooks/useUpdateVenue.ts';
import { Event, Venue } from '../../types/entities.ts';
import { CalendarIcon } from '../icons/CalendarIcon.tsx';
import { ChatIcon } from '../icons/ChatIcon.tsx';
import { EditIcon } from '../icons/EditIcon.tsx';

interface SpaceStewardshipPanelProps {
    space: Venue | Event;
    relatedEvents?: Event[];
}

const normalizeRefs = (value: CuratedSpaceRelationshipRefs | undefined): CuratedSpaceRelationshipRefs => ({
    ...(value?.bookIds?.length ? { bookIds: Array.from(new Set(value.bookIds)).slice(0, 25) } : {}),
    ...(value?.authorIds?.length ? { authorIds: Array.from(new Set(value.authorIds)).slice(0, 25) } : {}),
});

const getRelationshipSignature = (refs: CuratedSpaceRelationshipRefs): string =>
    JSON.stringify({
        bookIds: refs.bookIds || [],
        authorIds: refs.authorIds || [],
    });

export const canManageSpace = (
    space: Venue | Event | undefined,
    uid: string | undefined,
    isAdmin: boolean
): boolean => {
    if (!space || !uid) return false;
    if (isAdmin) return true;

    const adminUids = space.stewardship?.adminUids || space.communication?.adminUids || [];
    return (
        space.ownerId === uid ||
        space.stewardship?.createdByUid === uid ||
        space.stewardship?.managedByUid === uid ||
        adminUids.includes(uid) ||
        space.communication?.ownerUid === uid
    );
};

const SpaceStewardshipPanel: React.FC<SpaceStewardshipPanelProps> = ({ space, relatedEvents = [] }) => {
    const { user, isAdmin } = useAuth();
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { mutate: updateVenue, isPending: isSaving } = useUpdateVenue();
    const [isEditOpen, setEditOpen] = useState(false);
    const [draftRefs, setDraftRefs] = useState<CuratedSpaceRelationshipRefs>(() => normalizeRefs(space.relationshipRefs));

    useEffect(() => {
        setDraftRefs(normalizeRefs(space.relationshipRefs));
    }, [space.id, space.relationshipRefs]);

    const isEvent = 'dateTime' in space;
    const canManage = canManageSpace(space, user?.uid, isAdmin);
    const currentRefs = useMemo(() => normalizeRefs(space.relationshipRefs), [space.relationshipRefs]);
    const hasRelationshipChanges = getRelationshipSignature(currentRefs) !== getRelationshipSignature(normalizeRefs(draftRefs));
    const upcomingEvents = relatedEvents.filter(event => event.eventState !== 'completed' && new Date(event.dateTime).getTime() >= Date.now());
    const pastEvents = relatedEvents.filter(event => event.eventState === 'completed' || new Date(event.dateTime).getTime() < Date.now());
    const publicRoute = space.identity?.routePath || (space.identity?.slug ? `/spaces/${space.identity.slug}` : `/spaces/${space.id}`);
    const stewardLabel =
        space.authorityProfile?.stewardshipState === 'institutional'
            ? (lang === 'en' ? 'Institutional steward' : 'مشرف مؤسسي')
            : space.authorityProfile?.stewardshipState === 'system_seeded'
                ? (lang === 'en' ? 'BookTown seeded' : 'منسق من BookTown')
                : (lang === 'en' ? 'Community steward' : 'مشرف مجتمعي');
    const claimLabel =
        space.authorityProfile?.claimState === 'verified'
            ? (lang === 'en' ? 'Verified' : 'موثق')
            : space.authorityProfile?.claimState === 'institutional'
                ? (lang === 'en' ? 'Institutional' : 'مؤسسي')
                : space.authorityProfile?.claimState === 'claimed'
                    ? (lang === 'en' ? 'Claimed' : 'مطالب به')
                    : (lang === 'en' ? 'Unclaimed' : 'غير مطالب به');

    if (!canManage) {
        return null;
    }

    const saveRelationships = () => {
        const relationshipRefs = normalizeRefs(draftRefs);
        updateVenue({
            venueId: space.id,
            data: {
                ...space,
                relationshipRefs,
            } as Venue | Event,
        });
    };

    return (
        <section className="mt-12 rounded-md border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <BilingualText role="H1" className="!text-2xl">
                        {lang === 'en' ? 'Stewardship' : 'الإشراف'}
                    </BilingualText>
                    <BilingualText role="Body" className="mt-1 text-white/60">
                        {lang === 'en'
                            ? 'Curate this Space as a literary-cultural record.'
                            : 'نسق هذه المساحة كسجل أدبي وثقافي.'}
                    </BilingualText>
                </div>
                <Button variant="ghost" onClick={() => setEditOpen(true)} className="border border-white/10">
                    <EditIcon className="mr-2 h-4 w-4" />
                    {lang === 'en' ? 'Edit presentation' : 'تعديل العرض'}
                </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.35fr,1fr]">
                <div className="space-y-4">
                    <SpaceRelationshipCurationField
                        value={draftRefs}
                        onChange={setDraftRefs}
                        disabled={isSaving}
                    />
                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            onClick={saveRelationships}
                            disabled={!hasRelationshipChanges || isSaving}
                        >
                            {isSaving ? <LoadingSpinner /> : (lang === 'en' ? 'Save literary links' : 'حفظ الروابط الأدبية')}
                        </Button>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="rounded-md border border-white/10 p-3">
                        <BilingualText role="Body" className="font-semibold text-white/85">
                            {lang === 'en' ? 'Public identity' : 'الهوية العامة'}
                        </BilingualText>
                        <div className="mt-3 space-y-2 text-sm text-white/60">
                            <div className="flex justify-between gap-3">
                                <span>{lang === 'en' ? 'Route' : 'الرابط'}</span>
                                <span className="truncate text-white/80">{publicRoute}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span>{lang === 'en' ? 'Stewardship' : 'الإشراف'}</span>
                                <span className="text-white/80">{stewardLabel}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                                <span>{lang === 'en' ? 'Claim state' : 'حالة المطالبة'}</span>
                                <span className="text-white/80">{claimLabel}</span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-md border border-white/10 p-3">
                        <div className="mb-2 flex items-center gap-2 font-semibold text-white/85">
                            <CalendarIcon className="h-4 w-4 text-accent" />
                            <span>{lang === 'en' ? 'Continuity' : 'الاستمرارية'}</span>
                        </div>
                        {isEvent ? (
                            <BilingualText role="Body" className="text-white/60">
                                {space.continuity?.historicalRecord
                                    ? (lang === 'en' ? 'This event is preserved as a cultural record.' : 'هذه الفعالية محفوظة كسجل ثقافي.')
                                    : (lang === 'en' ? 'Event continuity metadata is not present yet.' : 'بيانات الاستمرارية غير موجودة بعد.')}
                            </BilingualText>
                        ) : (
                            <div className="space-y-2 text-sm text-white/65">
                                <div className="flex justify-between">
                                    <span>{lang === 'en' ? 'Upcoming events' : 'فعاليات قادمة'}</span>
                                    <span className="text-white/85">{upcomingEvents.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>{lang === 'en' ? 'Historical records' : 'سجلات تاريخية'}</span>
                                    <span className="text-white/85">{pastEvents.length}</span>
                                </div>
                                {relatedEvents.slice(0, 3).map(event => (
                                    <button
                                        key={event.id}
                                        type="button"
                                        onClick={() => navigate({
                                            type: 'immersive',
                                            id: 'venueDetails',
                                            params: {
                                                venueId: event.id,
                                                ...(event.identity?.slug ? { spaceSlug: event.identity.slug, canonicalSlug: event.identity.slug } : {}),
                                                from: currentView,
                                            },
                                        })}
                                        className="block w-full truncate rounded-sm border border-white/10 px-2 py-1 text-left text-xs text-white/70 hover:border-accent hover:text-accent"
                                    >
                                        {lang === 'en' ? event.titleEn : event.titleAr || event.titleEn}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="rounded-md border border-white/10 p-3">
                        <div className="mb-2 flex items-center gap-2 font-semibold text-white/85">
                            <ChatIcon className="h-4 w-4 text-accent" />
                            <span>{lang === 'en' ? 'Space inbox' : 'صندوق المساحة'}</span>
                        </div>
                        <BilingualText role="Body" className="text-white/60">
                            {space.communication?.inboxStatus === 'available'
                                ? (lang === 'en' ? 'Messages are routed to Space stewards.' : 'توجه الرسائل إلى مشرفي المساحة.')
                                : (lang === 'en' ? 'Space messaging is not open yet.' : 'مراسلة المساحة غير مفعلة بعد.')}
                        </BilingualText>
                    </div>
                </div>
            </div>

            <EditVenueModal
                isOpen={isEditOpen}
                onClose={() => setEditOpen(false)}
                venue={space}
            />
        </section>
    );
};

export default SpaceStewardshipPanel;
