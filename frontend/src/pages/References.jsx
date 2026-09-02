import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Paper, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import SearchableSelect from '../components/SearchableSelect';
import { useFeedback } from '../hooks/useFeedback';
import { CATALOG_PAGE_SIZE, extractApiError, unwrapList } from '../utils';

const STATUS_KIND_LABELS = {
  open: 'В работе',
  completed: 'Продажа',
  cancelled: 'Отмена',
};

const STATUS_KIND_OPTIONS = [
  { value: 'open', label: 'В работе' },
  { value: 'completed', label: 'Продажа' },
  { value: 'cancelled', label: 'Отмена' },
];

const STATUS_KIND_HELP = {
  open: 'Заказ ещё идёт, товар на складе не списывается.',
  completed: 'Заказ закрыт, товар списывается со склада.',
  cancelled: 'Заказ закрыт без списания товара.',
};

const TABS = [
  {
    id: 'statuses',
    label: 'Статусы заказа',
    endpoint: '/orders/order_statuses/',
    columns: [
      { key: 'name', label: 'Название' },
      { key: 'kind', label: 'Как работает', format: (value) => STATUS_KIND_LABELS[value] || value },
    ],
    fields: [
      { key: 'name', label: 'Название', required: true },
      {
        key: 'kind',
        label: 'Как работает',
        required: true,
        type: 'select',
        options: STATUS_KIND_OPTIONS,
        locked: (form) => Boolean(form.is_system),
      },
    ],
    emptyForm: { name: '', kind: 'open', is_system: false },
    cannotDelete: (row) => row.is_system,
  },
  {
    id: 'channels',
    label: 'Каналы продаж',
    endpoint: '/orders/sales_channels/',
    columns: [{ key: 'name', label: 'Название' }],
    fields: [{ key: 'name', label: 'Название', required: true }],
    emptyForm: { name: '' },
  },
  {
    id: 'categories',
    label: 'Типы товаров',
    endpoint: '/catalog/product_categories/',
    columns: [{ key: 'name', label: 'Название' }],
    fields: [{ key: 'name', label: 'Название', required: true }],
    emptyForm: { name: '' },
  },
  {
    id: 'grill_types',
    label: 'Типы гриля',
    endpoint: '/catalog/grill_types/',
    columns: [{ key: 'name', label: 'Название' }],
    fields: [{ key: 'name', label: 'Название', required: true }],
    emptyForm: { name: '' },
  },
  {
    id: 'deliveries',
    label: 'Доставка',
    endpoint: '/orders/delivery_services/',
    columns: [{ key: 'name', label: 'Название' }],
    fields: [{ key: 'name', label: 'Название', required: true }],
    emptyForm: { name: '' },
  },
  {
    id: 'payments',
    label: 'Оплата',
    endpoint: '/orders/payment_types/',
    columns: [{ key: 'name', label: 'Название' }],
    fields: [{ key: 'name', label: 'Название', required: true }],
    emptyForm: { name: '' },
  },
  {
    id: 'suppliers',
    label: 'Поставщики',
    endpoint: '/catalog/suppliers/',
    columns: [
      { key: 'name', label: 'Название' },
      { key: 'phone', label: 'Телефон' },
    ],
    fields: [
      { key: 'name', label: 'Название', required: true },
      { key: 'phone', label: 'Телефон' },
    ],
    emptyForm: { name: '', phone: '' },
  },
];

const cellValue = (row, column) => {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '—';
  if (column.format) return column.format(value, row);
  return value;
};

const References = () => {
  const { notify, confirm } = useFeedback();
  const [tab, setTab] = useState(0);
  const spec = TABS[tab];
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [listVersion, setListVersion] = useState(0);
  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(spec.emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    api.get(spec.endpoint, { params: { page_size: CATALOG_PAGE_SIZE } })
      .then((response) => {
        if (cancelled) return;
        setRows(unwrapList(response.data));
        setListError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setListError(extractApiError(error));
        notify(`Не удалось загрузить справочник:\n${extractApiError(error)}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [spec.endpoint, listVersion, notify]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ ...spec.emptyForm });
    setFormError(null);
    setOpenModal(true);
  };

  const openEdit = (row) => {
    const next = { ...spec.emptyForm };
    Object.keys(next).forEach((key) => {
      next[key] = row[key] ?? '';
    });
    setEditingId(row.id);
    setFormData(next);
    setFormError(null);
    setOpenModal(true);
  };

  const handleSave = async () => {
    const payload = {};
    for (const field of spec.fields) {
      if (field.locked?.(formData)) continue;
      const value = typeof formData[field.key] === 'string'
        ? formData[field.key].trim()
        : formData[field.key];
      if (field.required && !value) {
        setFormError(`Заполните поле «${field.label}»`);
        return;
      }
      payload[field.key] = value;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await api.patch(`${spec.endpoint}${editingId}/`, payload);
      } else {
        await api.post(spec.endpoint, payload);
      }
      setOpenModal(false);
      setListVersion((v) => v + 1);
    } catch (error) {
      setFormError(extractApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (spec.cannotDelete?.(row)) return;
    if (!(await confirm(`Удалить «${row.name}»?`))) return;
    setDeletingId(row.id);
    try {
      await api.delete(`${spec.endpoint}${row.id}/`);
      setListVersion((v) => v + 1);
    } catch (error) {
      notify(`Не удалось удалить:\n${extractApiError(error)}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Справочники</Typography>
        <Button variant="contained" onClick={openCreate}>
          Добавить
        </Button>
      </Box>

      <Paper sx={{ overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, next) => {
            setTab(next);
            setOpenModal(false);
          }}
          variant="scrollable"
          allowScrollButtonsMobile
          sx={{ px: 2, borderBottom: '1px solid #EDF2F7' }}
        >
          {TABS.map((item) => (
            <Tab key={item.id} label={item.label} />
          ))}
        </Tabs>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {spec.columns.map((column) => (
                  <TableCell key={column.key}>{column.label}</TableCell>
                ))}
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {listLoading ? (
                <TableRow>
                  <TableCell colSpan={spec.columns.length + 1} align="center" sx={{ py: 4, color: '#718096' }}>
                    Загрузка…
                  </TableCell>
                </TableRow>
              ) : listError ? (
                <TableRow>
                  <TableCell colSpan={spec.columns.length + 1} align="center" sx={{ py: 4, color: '#E53E3E' }}>
                    Не удалось загрузить справочник
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={spec.columns.length + 1} align="center" sx={{ py: 4, color: '#718096' }}>
                    Пока пусто
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => openEdit(row)}>
                  {spec.columns.map((column) => (
                    <TableCell key={column.key}>{cellValue(row, column)}</TableCell>
                  ))}
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    {spec.cannotDelete?.(row) ? (
                      <Typography variant="caption" sx={{ color: '#A0AEC0' }}>нельзя удалить</Typography>
                    ) : (
                      <Tooltip title="Удалить">
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Удалить ${row.name}`}
                            disabled={deletingId === row.id}
                            onClick={() => handleDelete(row)}
                          >
                            <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">delete</span>
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Изменить' : 'Добавить'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {formError && (
            <Alert severity="error" role="alert" aria-live="assertive">{formError}</Alert>
          )}
          {spec.fields.map((field) => {
            if (field.type === 'select') {
              const locked = Boolean(field.locked?.(formData));
              return (
                <Box key={field.key}>
                  <SearchableSelect
                    id={`reference-${spec.id}-${field.key}`}
                    label={field.label}
                    required={field.required}
                    disabled={locked}
                    value={formData[field.key] || ''}
                    options={field.options}
                    onChange={(value) => setFormData((prev) => ({ ...prev, [field.key]: value }))}
                  />
                  {STATUS_KIND_HELP[formData[field.key]] && (
                    <Typography variant="caption" sx={{ color: '#718096', display: 'block', mt: 0.5 }}>
                      {STATUS_KIND_HELP[formData[field.key]]}
                    </Typography>
                  )}
                  {locked && (
                    <Typography variant="caption" sx={{ color: '#718096', display: 'block', mt: 0.5 }}>
                      У базового статуса это нельзя изменить
                    </Typography>
                  )}
                </Box>
              );
            }
            return (
              <TextField
                key={field.key}
                autoFocus={field.key === 'name'}
                fullWidth
                label={field.label}
                required={field.required}
                value={formData[field.key] || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            );
          })}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} color="inherit">Отмена</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? <CircularProgress size={22} /> : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default References;
