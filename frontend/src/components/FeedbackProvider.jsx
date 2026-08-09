import { useCallback, useMemo, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar,
} from '@mui/material';
import { FeedbackContext } from './feedbackContext';

export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState({ open: false, message: '', severity: 'info' });
  const [confirmState, setConfirmState] = useState(null); // { title, message, resolve }

  const notify = useCallback((message, severity = 'info') => {
    setToast({ open: true, message: String(message), severity });
  }, []);

  const confirm = useCallback((message, { title = 'Подтверждение' } = {}) => {
    return new Promise((resolve) => {
      setConfirmState((prev) => {
        prev?.resolve(false);
        return { title, message: String(message), resolve };
      });
    });
  }, []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={5000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          role="alert"
          aria-live="assertive"
        >
          {toast.message}
        </Alert>
      </Snackbar>
      <Dialog
        open={Boolean(confirmState)}
        onClose={() => {
          confirmState?.resolve(false);
          setConfirmState(null);
        }}
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <DialogTitle id="confirm-dialog-title">{confirmState?.title}</DialogTitle>
        <DialogContent id="confirm-dialog-description">{confirmState?.message}</DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              confirmState?.resolve(false);
              setConfirmState(null);
            }}
          >
            Отмена
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              confirmState?.resolve(true);
              setConfirmState(null);
            }}
            autoFocus
          >
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>
    </FeedbackContext.Provider>
  );
}
