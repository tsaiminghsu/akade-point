import { create } from "zustand";
import type { FullQuestionnaireValues, QuestionnaireMode } from "@/types/questionnaire";
import { FULL_QUESTIONNAIRE_DEFAULT } from "@/types/questionnaire";

interface QuestionnaireState {
  mode: QuestionnaireMode | null;
  formData: Partial<FullQuestionnaireValues>;
  isSubmitted: boolean;
  setMode: (mode: QuestionnaireMode) => void;
  setFormData: (data: Partial<FullQuestionnaireValues>) => void;
  setSubmitted: (val: boolean) => void;
  reset: () => void;
}

export const useQuestionnaireStore = create<QuestionnaireState>((set) => ({
  mode: null,
  formData: FULL_QUESTIONNAIRE_DEFAULT,
  isSubmitted: false,
  setMode: (mode) => set({ mode }),
  setFormData: (data) => set((s) => ({ formData: { ...s.formData, ...data } })),
  setSubmitted: (val) => set({ isSubmitted: val }),
  reset: () => set({ mode: null, formData: FULL_QUESTIONNAIRE_DEFAULT, isSubmitted: false }),
}));
