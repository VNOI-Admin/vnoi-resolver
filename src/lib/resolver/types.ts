export type InputUser = {
  userId: number;
  username: string;
  fullName: string;
};

export type InputProblem = {
  problemId: number;
  name: string;
  points: number;
};

export type InputSubmission = {
  submissionId: number;
  problemId: number;
  userId: number;
  time: number;
  points: number;
};

export type InputData = {
  users: InputUser[];
  problems: InputProblem[];
  submissions: InputSubmission[];
};

export type AwardImageMap = {
  [rank: string]: string;
};

export enum ProblemAttemptStatus {
  UNATTEMPTED = 1,
  INCORRECT = 2,
  PARTIAL = 4,
  ACCEPTED = 8,
  PENDING = 16
}

export type PointByProblemId = { [problemId: number]: number };
export type StatusByProblemId = { [problemId: number]: ProblemAttemptStatus };
export type ScoreClassByProblemId = { [problemId: number]: string };
export type ProblemById = { [problemId: number]: InputProblem };
export type SubmissionById = { [submissionId: number]: InputSubmission };

export type InternalUser = InputUser & {
  points: PointByProblemId;
  status: StatusByProblemId;
  scoreClass: ScoreClassByProblemId;
  lastAlteringScoreSubmissionIdByProblemId: { [problemId: number]: number };
  submissionIdsByProblemId: { [problemId: number]: number[] };
  pendingSubmissionIds: number[];
  penalty: number;
};

export type InternalState = {
  shownImage: boolean;
  imageSrc: string | null;
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
  // The submission mark_problem validated and resolve consumes. -1 when no
  // problem is marked. markedProblemId still drives the pill highlight; this
  // pins the exact id so resolve never has to re-match by problemId.
  markedSubmissionId: number;
  users: { [userId: number]: InternalUser };
};

export type UserRow = {
  rank: string;
  userId: number;
  username: string;
  fullName: string;
  total: number;
  penalty: number;
  points: PointByProblemId;
  status: StatusByProblemId;
  scoreClass: ScoreClassByProblemId;
  submissionIdsByProblemId: { [problemId: number]: number[] };
};
