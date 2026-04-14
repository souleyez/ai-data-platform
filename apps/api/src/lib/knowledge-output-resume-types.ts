export type ResumePageEntry = {
  candidateName: string;
  education: string;
  latestCompany: string;
  yearsOfExperience: string;
  skills: string[];
  projectHighlights: string[];
  itProjectHighlights: string[];
  highlights: string[];
  expectedCity: string;
  expectedSalary: string;
  sourceName: string;
  sourceTitle: string;
  summary: string;
};

export type ResumeShowcaseProject = {
  label: string;
  value: number;
  ownerName: string;
  ownerKey: string;
  company: string;
  companyKey: string;
  fit: string;
};

export type ResumePageStats = {
  entries: ResumePageEntry[];
  candidateCount: number;
  companyCount: number;
  projectCount: number;
  skillCount: number;
  companies: Array<{ label: string; value: number }>;
  projects: Array<{ label: string; value: number }>;
  skills: Array<{ label: string; value: number }>;
  educations: Array<{ label: string; value: number }>;
  candidateLines: string[];
  companyLines: string[];
  projectLines: string[];
  skillLines: string[];
  salaryLines: string[];
  showcaseCandidateNames: string[];
  showcaseProjectLabels: string[];
  showcaseProjects: ResumeShowcaseProject[];
};
