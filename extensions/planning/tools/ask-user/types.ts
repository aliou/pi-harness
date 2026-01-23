export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface Answer {
  question: string;
  header: string;
  selections: string[];
}

export interface AskUserQuestionDetails {
  questions: Question[];
  answers: Answer[];
  error?: string;
}
