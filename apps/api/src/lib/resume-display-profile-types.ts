export type ResumeDisplayProfile = {
  sourcePath: string;
  sourceName: string;
  displayName: string;
  displayCompany: string;
  displayProjects: string[];
  displaySkills: string[];
  displaySummary: string;
};

export type ResumeDisplayProfileResolution = {
  profiles: ResumeDisplayProfile[];
};
