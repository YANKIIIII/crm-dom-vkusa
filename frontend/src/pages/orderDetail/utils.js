export const BASE_WRITABLE_FIELDS = [
  'order_date',
  'sales_channel',
  'client',
  'discount_percent',
  'comment',
  'delivery_service',
  'tracking_number',
  'status',
];

export const writableFields = (includeSeller) => (
  includeSeller ? [...BASE_WRITABLE_FIELDS, 'seller'] : BASE_WRITABLE_FIELDS
);

export const emptyNewOrder = () => ({
  items: [],
  payments: [],
  order_date: new Date().toISOString().slice(0, 10),
  sales_channel: '',
  status: 'reserved',
  discount_percent: 0,
  comment: '',
  client: null,
  seller: null,
  delivery_service: null,
  tracking_number: '',
});

export const normalizeEmpty = (field, value) => {
  if (
    (field === 'sales_channel' || field === 'delivery_service' || field === 'client' || field === 'seller')
    && (value === '' || value === undefined)
  ) {
    return null;
  }
  return value;
};

export const pickWritable = (order, includeSeller) => {
  const payload = {};
  for (const field of writableFields(includeSeller)) {
    const value = normalizeEmpty(field, order[field]);
    if (value !== undefined) payload[field] = value;
  }
  return payload;
};

export const diffWritable = (current, baseline, includeSeller) => {
  const payload = {};
  for (const field of writableFields(includeSeller)) {
    const cur = normalizeEmpty(field, current[field]);
    const base = normalizeEmpty(field, baseline?.[field]);
    if (String(cur ?? '') !== String(base ?? '')) {
      payload[field] = cur ?? null;
    }
  }
  return payload;
};

export const formatUserName = (user) => (
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '—'
);

export const clientIdOf = (orderLike) => {
  const value = orderLike?.client;
  if (value && typeof value === 'object') {
    return value.id ?? value.pk ?? null;
  }
  return value || null;
};

export const isGrillProduct = (product) => String(product?.category_code || '').trim() === 'A';
