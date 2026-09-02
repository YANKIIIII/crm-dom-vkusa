export const formatCurrency = (value) => {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'BYN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU');

/** Formats ISO / YYYY-MM-DD (or Date) for display. Returns '' for empty values. */
export const formatDate = (value) => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateFormatter.format(date);
};

export const PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50, 100];
export const CATALOG_PAGE_SIZE = 100;

export const DEFAULT_GRILL_TYPES = [
  { code: 'charcoal', name: 'Угольный' },
  { code: 'gas', name: 'Газовый' },
  { code: 'ceramic', name: 'Керамический' },
  { code: 'electric', name: 'Электрический' },
  { code: 'pellet', name: 'Пеллетный' },
];

export const GRILL_TYPE_LABELS = Object.fromEntries(
  DEFAULT_GRILL_TYPES.map((row) => [row.code, row.name]),
);

export function mapGrillTypes(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const source = list.length ? list : DEFAULT_GRILL_TYPES;
  return source.map((row) => ({
    ...row,
    value: row.code,
    label: row.name,
  }));
}

export const DEFAULT_ORDER_STATUSES = [
  { code: 'reserved', name: 'Резерв', kind: 'open' },
  { code: 'confirmed', name: 'Подтвержден', kind: 'open' },
  { code: 'in_delivery', name: 'В доставке', kind: 'open' },
  { code: 'completed', name: 'Завершен', kind: 'completed' },
  { code: 'cancelled', name: 'Отменен', kind: 'cancelled' },
];

export function mapOrderStatuses(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const codes = new Set(list.map((row) => row.code));
  const merged = [
    ...DEFAULT_ORDER_STATUSES.filter((row) => !codes.has(row.code)),
    ...list,
  ];
  return merged.map((row) => ({
    ...row,
    value: row.code,
    label: row.name,
  }));
}

export function isTerminalOrderStatus(status, statuses = []) {
  const row = statuses.find((item) => item.value === status || item.code === status);
  if (row?.kind) {
    return row.kind === 'completed' || row.kind === 'cancelled';
  }
  return status === 'completed' || status === 'cancelled';
}

export function unwrapList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  return [];
}

export const ALL_MODULES = [
  'analytics', 'orders', 'clients', 'warehouse', 'references', 'users', 'audit',
];

export const GRANTABLE_MODULES = [
  { key: 'analytics', label: 'Аналитика' },
  { key: 'orders', label: 'Заказы' },
  { key: 'clients', label: 'Клиенты' },
  { key: 'warehouse', label: 'Склад' },
  { key: 'references', label: 'Справочники' },
];

export const SELLER_DEFAULT_MODULES = ['orders', 'clients', 'warehouse'];

const MODULE_HOME = [
  ['analytics', '/'],
  ['orders', '/orders'],
  ['clients', '/clients'],
  ['warehouse', '/warehouse'],
  ['references', '/references'],
  ['users', '/users'],
  ['audit', '/audit'],
];

export function readStoredModules() {
  try {
    const parsed = JSON.parse(localStorage.getItem('user_modules') || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function hasModule(module) {
  if (localStorage.getItem('user_role') === 'manager') return true;
  const stored = readStoredModules();
  const effective = stored.length ? stored : SELLER_DEFAULT_MODULES;
  return effective.includes(module);
}

export function homePath() {
  const match = MODULE_HOME.find(([module]) => hasModule(module));
  return match ? match[1] : '/orders';
}

export function toggleOrdering(current, field, defaultDesc = false) {
  if (current === field) return `-${field}`;
  if (current === `-${field}`) return field;
  return defaultDesc ? `-${field}` : field;
}

export function buildListQuery({ page, pageSize, search, ordering, extra = {} }) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('page_size', String(pageSize || PAGE_SIZE));
  if (search) params.set('search', search);
  if (ordering) params.set('ordering', ordering);
  Object.entries(extra).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

export function toRangeQuery(op, from, to) {
  if (!op) return { min: '', max: '' };
  if (op === 'gte') return { min: from, max: '' };
  if (op === 'lte') return { min: '', max: from };
  if (op === 'between') return { min: from, max: to };
  return { min: '', max: '' };
}

export function rangeInputFromQuery(min, max, op = '') {
  if (op === 'between') return { op, from: min || '', to: max || '' };
  if (op === 'lte') return { op, from: max || min || '', to: '' };
  if (op === 'gte') return { op, from: min || '', to: '' };
  if (min && max) return { op: 'between', from: min, to: max };
  if (min) return { op: 'gte', from: min, to: '' };
  if (max) return { op: 'lte', from: max, to: '' };
  return { op: '', from: '', to: '' };
}

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
