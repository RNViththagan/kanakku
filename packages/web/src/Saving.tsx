import { Alert } from '@wso2/oxygen-ui';
import { useState } from 'react';

export const SAVED = 'Saved. Kanakku is updating.';

interface SaveState {
  saving: boolean;
  error?: string;
  done?: string;
}

export function useSave() {
  const [state, setState] = useState<SaveState>({ saving: false });
  const run = async (action: () => Promise<unknown>, done = SAVED): Promise<boolean> => {
    setState({ saving: true });
    try {
      await action();
      setState({ saving: false, done });
      return true;
    } catch (problem) {
      setState({
        saving: false,
        error: problem instanceof Error ? problem.message : String(problem),
      });
      return false;
    }
  };
  return { ...state, run };
}

export function SaveNote({
  error,
  done,
}: {
  error?: string | undefined;
  done?: string | undefined;
}) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (done) return <Alert severity="success">{done}</Alert>;
  return null;
}
