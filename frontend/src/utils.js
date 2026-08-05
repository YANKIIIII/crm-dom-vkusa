export const formatCurrency = (value) => {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'BYN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

// Backend paginates all list endpoints with DRF PAGE_SIZE=20
export const PAGE_SIZE = 20;

// Builds a readable message from a DRF error response:
// {"detail": "..."}, {"non_field_errors": [...]}, field errors
// like {"status": ["..."]}, or a bare list of messages.
export const extractApiError = (error, fallback = 'Произошла ошибка. Попробуйте ещё раз.') => {
  const data = error?.response?.data;
  if (!data) return fallback;
  if (typeof data === 'string') return fallback;
  if (Array.isArray(data)) return data.join('\n') || fallback;
  if (data.detail) return data.detail;
  const parts = Object.entries(data).map(([field, messages]) => {
    const text = Array.isArray(messages) ? messages.join(' ') : String(messages);
    return field === 'non_field_errors' ? text : `${field}: ${text}`;
  });
  return parts.length > 0 ? parts.join('\n') : fallback;
};
