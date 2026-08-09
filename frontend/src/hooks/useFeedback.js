import { useContext } from 'react';
import { FeedbackContext } from '../components/feedbackContext';

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider');
  return ctx;
}
