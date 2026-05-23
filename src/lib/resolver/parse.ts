import type { InputData, InputSubmission } from './types';

type RawSubmission = Omit<InputSubmission, 'time'> & { time: number | string };
type RawInputData = Omit<InputData, 'submissions'> & {
  submissions: RawSubmission[];
};

export function parseInputData(raw: unknown): InputData {
  const data = raw as RawInputData;
  return {
    ...data,
    submissions: data.submissions.map((submission) => ({
      ...submission,
      time:
        typeof submission.time === 'number'
          ? submission.time
          : parseFloat(submission.time)
    }))
  };
}
