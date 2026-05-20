import React, { useState } from "react";
import Modal from "../ui/Modal.tsx";
import Button from "../ui/Button.tsx";
import BilingualText from "../ui/BilingualText.tsx";
import LoadingSpinner from "../ui/LoadingSpinner.tsx";
import { useI18n } from "../../store/i18n.tsx";
import { useSubmitFeedback } from "../../lib/hooks/useSubmitFeedback.ts";
import { useFeedbackAttachmentUpload, validateFeedbackAttachmentFile } from "../../lib/hooks/useFeedbackAttachmentUpload.ts";
import type { FeedbackIntentType } from "../../contracts/apiContracts.ts";
import type { FeedbackRuntimeContext } from "../../lib/feedback/FeedbackContextService.ts";

type QuickAction = {
  labelEn: string;
  labelAr: string;
  intentType: FeedbackIntentType;
};

const QUICK_ACTIONS: QuickAction[] = [
  { labelEn: "Something feels wrong", labelAr: "هناك شيء غير صحيح", intentType: "beta_observation" },
  { labelEn: "Report a bug", labelAr: "الإبلاغ عن خطأ", intentType: "bug" },
  { labelEn: "UX confusion", labelAr: "ارتباك في الاستخدام", intentType: "ux_confusion" },
  { labelEn: "Suggestion", labelAr: "اقتراح", intentType: "feature_request" },
];

type BetaFeedbackModalProps = {
  isOpen: boolean;
  onClose: () => void;
  context: FeedbackRuntimeContext | null;
};

const BetaFeedbackModal: React.FC<BetaFeedbackModalProps> = ({ isOpen, onClose, context }) => {
  const { lang } = useI18n();
  const { mutate: submitFeedback, isPending } = useSubmitFeedback();
  const { uploadAttachments, isUploading } = useFeedbackAttachmentUpload();
  const [intentType, setIntentType] = useState<FeedbackIntentType>("beta_observation");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const resetAndClose = () => {
    setText("");
    setIntentType("beta_observation");
    setError(null);
    setAttachments([]);
    setUploadProgress(null);
    onClose();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = text.trim();
    if (!normalized) return;

    submitFeedback(
      {
        source: "appnav_beta",
        intentType,
        text: normalized,
        contactEmail: null,
        clientContext: context,
      },
      {
        onSuccess: async (receipt) => {
          try {
            if (attachments.length > 0) {
              await uploadAttachments(receipt.feedbackId, attachments, (fileName, progress) => {
                setUploadProgress(`${fileName}: ${progress}%`);
              });
            }
            resetAndClose();
          } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Screenshot upload failed.");
          }
        },
        onError: (submissionError) => {
          setError(submissionError instanceof Error ? submissionError.message : "Feedback submission failed.");
        },
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose}>
      <form onSubmit={submit} className="space-y-4 pr-7">
        <BilingualText role="H1" className="!text-xl">
          {lang === "en" ? "Beta Feedback" : "ملاحظات بيتا"}
        </BilingualText>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.intentType}
              type="button"
              variant={intentType === action.intentType ? "primary" : "secondary"}
              size="sm"
              onClick={() => setIntentType(action.intentType)}
            >
              {lang === "en" ? action.labelEn : action.labelAr}
            </Button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          maxLength={4000}
          required
          placeholder={lang === "en" ? "What happened?" : "ماذا حدث؟"}
          className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent resize-y"
        />
        <div>
          <label className="inline-flex cursor-pointer items-center rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-black/5 dark:text-white/80 dark:hover:bg-white/10">
            {lang === "en" ? "Attach screenshot" : "إرفاق لقطة شاشة"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []).slice(0, 3);
                try {
                  selected.forEach(validateFeedbackAttachmentFile);
                  setAttachments(selected);
                  setError(null);
                } catch (validationError) {
                  setError(validationError instanceof Error ? validationError.message : "Invalid screenshot.");
                }
              }}
            />
          </label>
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-white/55">
              {attachments.map((file) => (
                <div key={`${file.name}:${file.size}`} className="flex items-center justify-between gap-3">
                  <span className="truncate">{file.name}</span>
                  <button type="button" onClick={() => setAttachments((current) => current.filter((item) => item !== file))}>
                    {lang === "en" ? "Remove" : "إزالة"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {uploadProgress && <BilingualText role="Caption" className="mt-2 block text-slate-500 dark:text-white/45">{uploadProgress}</BilingualText>}
        </div>
        {error && (
          <BilingualText role="Caption" className="block text-red-500 dark:text-red-300">
            {error}
          </BilingualText>
        )}
        <Button type="submit" className="w-full" disabled={isPending || isUploading || !text.trim()}>
          {isPending || isUploading ? <LoadingSpinner /> : (lang === "en" ? "Send Feedback" : "إرسال الملاحظات")}
        </Button>
      </form>
    </Modal>
  );
};

export default BetaFeedbackModal;
