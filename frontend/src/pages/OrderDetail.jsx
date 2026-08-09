import {
  Alert, Box, Paper, Grid, Typography, Button, TextField, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Select, MenuItem, Checkbox, Dialog,
  DialogTitle, DialogContent, DialogActions, CircularProgress, List, ListItemButton,
  ListItemText, InputAdornment, FormControl, InputLabel,
} from '@mui/material';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { extractApiError, formatCurrency } from '../utils';
import ProductSearchModal from '../components/ProductSearchModal';
import { useFeedback } from '../components/FeedbackProvider';

const ORDER_STATUSES = [
  { value: 'reserved', label: 'Резерв' },
  { value: 'confirmed', label: 'Подтвержден' },
  { value: 'in_delivery', label: 'В доставке' },
  { value: 'completed', label: 'Завершен' },
  { value: 'cancelled', label: 'Отменен' },
];

const ALLOWED = {
  reserved: ['confirmed', 'cancelled'],
  confirmed: ['in_delivery', 'completed', 'cancelled'],
  in_delivery: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const WRITABLE_FIELDS = [
  'order_date',
  'sales_channel',
  'client',
  'discount_percent',
  'comment',
  'delivery_service',
  'tracking_number',
  'status',
];

const emptyNewOrder = () => ({
  items: [],
  payments: [],
  order_date: new Date().toISOString().slice(0, 10),
  sales_channel: '',
  status: 'reserved',
  discount_percent: 0,
  comment: '',
  client: null,
  delivery_service: null,
  tracking_number: '',
});

const pickWritable = (order) => {
  const payload = {};
  for (const field of WRITABLE_FIELDS) {
    let value = order[field];
    if (field === 'sales_channel' && value === '') value = null;
    if (field === 'delivery_service' && value === '') value = null;
    if (field === 'client' && (value === '' || value === undefined)) value = null;
    if (value !== undefined) payload[field] = value;
  }
  return payload;
};

const diffWritable = (current, baseline) => {
  const payload = {};
  for (const field of WRITABLE_FIELDS) {
    let cur = current[field];
    let base = baseline?.[field];
    if (field === 'sales_channel' || field === 'delivery_service') {
      if (cur === '') cur = null;
      if (base === '') base = null;
    }
    if (field === 'client') {
      if (cur === '' || cur === undefined) cur = null;
      if (base === '' || base === undefined) base = null;
    }
    if (String(cur ?? '') !== String(base ?? '')) {
      payload[field] = cur ?? null;
    }
  }
  return payload;
};

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { notify, confirm } = useFeedback();
  const [tab, setTab] = useState(0);

  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [channels, setChannels] = useState([]);
  const [deliveryServices, setDeliveryServices] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mutatingItems, setMutatingItems] = useState(false);
  const userRole = localStorage.getItem('user_role');

  const [openProductDialog, setOpenProductDialog] = useState(false);
  const [openClientModal, setOpenClientModal] = useState(false);
  const [openPhoneModal, setOpenPhoneModal] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [selectedClientName, setSelectedClientName] = useState('');

  const [newPhone, setNewPhone] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  const [paymentType, setPaymentType] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const deliverySelectRef = useRef(null);

  const isTerminal = order?.status === 'completed' || order?.status === 'cancelled';
  const isNew = id === 'new';
  const canDeleteOrder = userRole === 'manager' && !isNew && !isTerminal;

  const refreshOrder = useCallback(async () => {
    if (isNew) return;
    const orderRes = await api.get(`/orders/orders/${id}/`);
    setOrder(orderRes.data);
    setBaseline(orderRes.data);
    if (orderRes.data.client_name) {
      setSelectedClientName(
        `${orderRes.data.client_name} ${orderRes.data.client_last_name || ''}`.trim()
      );
    }
  }, [id, isNew]);

  useEffect(() => {
    const fetchOrderData = async () => {
      setLoadError(null);
      try {
        const [channelRes, deliveryRes, paymentRes, productsRes] = await Promise.all([
          api.get('/orders/sales_channels/').catch(() => ({ data: [] })),
          api.get('/orders/delivery_services/').catch(() => ({ data: [] })),
          api.get('/orders/payment_types/').catch(() => ({ data: [] })),
          api.get('/catalog/product_cards/').catch(() => ({ data: [] })),
        ]);
        setChannels(channelRes.data.results || channelRes.data || []);
        setDeliveryServices(deliveryRes.data.results || deliveryRes.data || []);
        setPaymentTypes(paymentRes.data.results || paymentRes.data || []);
        setCatalogProducts(productsRes.data.results || productsRes.data || []);

        if (!isNew) {
          await refreshOrder();
        } else {
          const initial = emptyNewOrder();
          const clientId = searchParams.get('client');
          if (clientId) {
            initial.client = Number(clientId) || clientId;
            try {
              const clientRes = await api.get(`/clients/clients/${clientId}/`);
              setSelectedClientName(
                `${clientRes.data.first_name || ''} ${clientRes.data.last_name || ''}`.trim()
              );
              if (clientRes.data.discount_percent != null) {
                initial.discount_percent = clientRes.data.discount_percent;
              }
            } catch {
              setSelectedClientName(`Клиент #${clientId}`);
            }
          }
          setOrder(initial);
          setBaseline(null);
        }
      } catch (err) {
        console.error('Error fetching order data:', err);
        if (isNew) {
          setOrder(emptyNewOrder());
        } else {
          setOrder(null);
          setLoadError(extractApiError(err) || 'Не удалось загрузить заказ');
        }
      }
    };
    if (id) fetchOrderData();
  }, [id, isNew, searchParams, refreshOrder]);

  const handleChange = (field, value) => {
    setOrder((prev) => ({ ...prev, [field]: value }));
  };

  const handleStatusChange = async (nextStatus) => {
    if (nextStatus === order.status) return;
    if (nextStatus === 'cancelled') {
      if (!(await confirm('Отменить заказ? Это действие вернёт товар на склад.'))) return;
    }

    if (isNew) {
      handleChange('status', nextStatus);
      return;
    }

    // Prefer status-only PATCH when nothing else is dirty besides status
    const otherDiff = diffWritable({ ...order, status: baseline?.status }, baseline);
    delete otherDiff.status;
    const onlyStatus = Object.keys(otherDiff).length === 0;

    if (onlyStatus) {
      setSaving(true);
      try {
        await api.patch(`/orders/orders/${id}/`, { status: nextStatus });
        await refreshOrder();
      } catch (err) {
        notify(`Ошибка смены статуса:\n${extractApiError(err)}`, 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    handleChange('status', nextStatus);
  };

  const handleSave = async () => {
    if (!order.order_date) {
      notify('Укажите дату заказа', 'warning');
      return;
    }
    if (!order.sales_channel) {
      notify('Укажите канал привлечения', 'warning');
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const payload = pickWritable(order);
        // Do not send order_number; omit empty optional FKs noise
        if (!payload.client) delete payload.client;
        if (!payload.delivery_service) delete payload.delivery_service;
        const res = await api.post('/orders/orders/', payload);
        notify('Новый заказ создан', 'success');
        navigate(`/orders/${res.data.id}`);
      } else {
        const payload = diffWritable(order, baseline);
        if (Object.keys(payload).length === 0) {
          notify('Нет изменений для сохранения', 'warning');
          return;
        }
        if (Object.keys(payload).length === 1 && payload.status !== undefined) {
          await api.patch(`/orders/orders/${id}/`, { status: payload.status });
        } else {
          await api.patch(`/orders/orders/${id}/`, payload);
        }
        notify('Заказ сохранен', 'success');
        await refreshOrder();
      }
    } catch (err) {
      console.error(err);
      notify(`Ошибка при сохранении:\n${extractApiError(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!canDeleteOrder) return;
    if (
      !(await confirm(
        'Удалить заказ? Товар вернётся на склад (если заказ не завершён/отменён).'
      ))
    ) {
      return;
    }

    setDeleting(true);
    try {
      await api.delete(`/orders/orders/${id}/`);
      navigate('/orders');
    } catch (err) {
      notify(`Ошибка удаления заказа:\n${extractApiError(err)}`, 'error');
    } finally {
      setDeleting(false);
    }
  };

  const searchClients = async (q) => {
    setClientSearchLoading(true);
    try {
      const res = await api.get('/clients/clients/', { params: { search: q || undefined } });
      setClientResults(res.data.results || res.data || []);
    } catch (err) {
      console.error(err);
      setClientResults([]);
    } finally {
      setClientSearchLoading(false);
    }
  };

  const openClientPicker = () => {
    setOpenClientModal(true);
    setClientSearch('');
    searchClients('');
  };

  const selectClient = (client) => {
    handleChange('client', client.id);
    setSelectedClientName(`${client.first_name || ''} ${client.last_name || ''}`.trim());
    if (client.discount_percent != null) {
      handleChange('discount_percent', client.discount_percent);
    }
    setOpenClientModal(false);
  };

  const handleAddPhone = async () => {
    if (!order.client) {
      notify('Сначала выберите клиента', 'warning');
      return;
    }
    if (!newPhone.trim()) {
      notify('Введите номер телефона', 'warning');
      return;
    }
    setPhoneSaving(true);
    try {
      await api.post('/clients/client_phones/', {
        client: order.client,
        number: newPhone.trim(),
        is_primary: false,
      });
      notify('Телефон добавлен', 'success');
      setNewPhone('');
      setOpenPhoneModal(false);
    } catch (err) {
      notify(`Ошибка:\n${extractApiError(err)}`, 'error');
    } finally {
      setPhoneSaving(false);
    }
  };

  const handleAddProducts = async (selectedProducts) => {
    if (isNew) {
      notify('Сначала сохраните заказ, чтобы добавлять в него товары', 'warning');
      return;
    }
    if (isTerminal) {
      notify('Нельзя изменять товары в завершённом или отменённом заказе', 'warning');
      return;
    }
    setMutatingItems(true);
    try {
      for (const product of selectedProducts) {
        // rrp is WITH VAT → store price WITHOUT VAT on the order item
        const priceExVat = product.rrp
          ? parseFloat(product.rrp) / 1.2
          : parseFloat(product.base_cost_price) * 1.5;
        const itemData = {
          order: id,
          product_card: product.id,
          quantity: 1,
          price: Math.round(priceExVat * 100) / 100,
          cost_price: product.base_cost_price,
          vat_rate: 20,
        };
        await api.post('/orders/order_items/', itemData);
      }
      await refreshOrder();
    } catch (err) {
      console.error('Failed to add products', err);
      notify(`Ошибка при добавлении товаров:\n${extractApiError(err)}`, 'error');
      await refreshOrder();
    } finally {
      setMutatingItems(false);
    }
  };

  const handleQtyChange = async (item, rawQty) => {
    if (isTerminal) return;
    const quantity = parseInt(rawQty, 10);
    if (!quantity || quantity < 1 || quantity === item.quantity) return;
    setMutatingItems(true);
    try {
      await api.patch(`/orders/order_items/${item.id}/`, { quantity });
      await refreshOrder();
    } catch (err) {
      notify(`Ошибка изменения количества:\n${extractApiError(err)}`, 'error');
      await refreshOrder();
    } finally {
      setMutatingItems(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (isTerminal) return;
    if (!(await confirm(`Удалить позицию «${item.product_name}»?`))) return;
    setMutatingItems(true);
    try {
      await api.delete(`/orders/order_items/${item.id}/`);
      await refreshOrder();
    } catch (err) {
      notify(`Ошибка удаления:\n${extractApiError(err)}`, 'error');
    } finally {
      setMutatingItems(false);
    }
  };

  const handleAddPayment = async () => {
    if (isNew) {
      notify('Сначала сохраните заказ', 'warning');
      return;
    }
    if (isTerminal) {
      notify('Нельзя добавлять оплату к завершённому или отменённому заказу', 'warning');
      return;
    }
    if (!paymentType) {
      notify('Выберите способ оплаты', 'warning');
      return;
    }
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      notify('Укажите сумму оплаты', 'warning');
      return;
    }
    setPaymentSaving(true);
    try {
      await api.post('/orders/order_payments/', {
        order: id,
        payment_type: paymentType,
        amount,
      });
      setPaymentType('');
      setPaymentAmount('');
      await refreshOrder();
    } catch (err) {
      notify(`Ошибка добавления оплаты:\n${extractApiError(err)}`, 'error');
    } finally {
      setPaymentSaving(false);
    }
  };

  const focusDelivery = () => {
    deliverySelectRef.current?.focus?.();
    // MUI Select focuses via native select node when available
    const el = deliverySelectRef.current;
    if (el && typeof el.nodeName === 'string') {
      el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  };

  if (loadError) {
    return (
      <Box sx={{ p: 4, maxWidth: 640, margin: '0 auto' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
        <Button variant="contained" onClick={() => navigate('/orders')}>
          К списку заказов
        </Button>
      </Box>
    );
  }

  if (!order) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Загрузка…</Typography>
      </Box>
    );
  }

  const payments = order.payments || [];
  const paidTotal = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const orderTotal = parseFloat(order.total || 0);
  const remaining = Math.max(0, orderTotal - paidTotal);

  const statusOptions = (() => {
    const current = order.status || 'reserved';
    const allowed = ALLOWED[current] || [];
    const values = [current, ...allowed.filter((v) => v !== current)];
    return ORDER_STATUSES.filter((s) => values.includes(s.value));
  })();

  const clientDisplayName =
    selectedClientName ||
    (order.client_name
      ? `${order.client_name} ${order.client_last_name || ''}`.trim()
      : 'Не выбран');

  const paymentTypeName = (ptId) =>
    paymentTypes.find((pt) => pt.id === ptId)?.name || `Тип #${ptId}`;

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', pb: 10 }}>
      <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 4 }}>
        <Box
          sx={{
            p: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #EDF2F7',
          }}
        >
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant={tab === 0 ? 'outlined' : 'text'}
              onClick={() => setTab(0)}
              sx={{
                borderRadius: 8,
                borderColor: tab === 0 ? '#E2E8F0' : 'transparent',
                color: tab === 0 ? '#1A202C' : '#718096',
                fontWeight: tab === 0 ? 600 : 400,
                textTransform: 'none',
                px: 3,
                py: 1,
              }}
            >
              Данные о заказе
            </Button>
            <Button
              variant={tab === 1 ? 'outlined' : 'text'}
              onClick={() => setTab(1)}
              sx={{
                borderRadius: 8,
                borderColor: tab === 1 ? '#E2E8F0' : 'transparent',
                color: tab === 1 ? '#1A202C' : '#718096',
                fontWeight: tab === 1 ? 600 : 400,
                textTransform: 'none',
                px: 3,
                py: 1,
              }}
            >
              Товары и оплата
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            {canDeleteOrder && (
              <Button
                variant="outlined"
                color="error"
                onClick={handleDeleteOrder}
                disabled={deleting || saving}
              >
                {deleting ? <CircularProgress size={22} color="inherit" /> : 'Удалить заказ'}
              </Button>
            )}
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              disabled={saving || deleting}
            >
              {saving ? <CircularProgress size={22} color="inherit" /> : 'СОХРАНИТЬ ЗАКАЗ'}
            </Button>
          </Box>
        </Box>

        {tab === 0 && (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>
                {isNew ? 'Новый заказ' : `Заказ ${order.order_number}`}
              </Typography>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    required
                    label="Дата заказа"
                    InputLabelProps={{ shrink: true }}
                    value={order.order_date || ''}
                    onChange={(e) => handleChange('order_date', e.target.value)}
                  />
                </Grid>
                <Grid size={4}>
                  <FormControl fullWidth size="small" required>
                    <InputLabel id="order-sales-channel-label">Канал привлечения</InputLabel>
                    <Select
                      labelId="order-sales-channel-label"
                      id="order-sales-channel"
                      displayEmpty
                      label="Канал привлечения"
                      value={order.sales_channel || ''}
                      onChange={(e) => handleChange('sales_channel', e.target.value)}
                    >
                      <MenuItem value="" disabled>
                        Выберите канал
                      </MenuItem>
                      {channels.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={4}>
                  <FormControl
                    fullWidth
                    size="small"
                    disabled={saving || (!isNew && statusOptions.length <= 1)}
                  >
                    <InputLabel id="order-status-label">Статус</InputLabel>
                    <Select
                      labelId="order-status-label"
                      id="order-status"
                      label="Статус"
                      value={order.status || 'reserved'}
                      onChange={(e) => handleStatusChange(e.target.value)}
                    >
                      {statusOptions.map((s) => (
                        <MenuItem key={s.value} value={s.value}>
                          {s.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <TextField
                fullWidth
                size="small"
                label="Примечание"
                value={order.comment || ''}
                onChange={(e) => handleChange('comment', e.target.value)}
              />
            </Box>

            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 3,
                }}
              >
                <Typography variant="h5">Доставка</Typography>
                <Button
                  variant="outlined"
                  color="secondary"
                  sx={{ textTransform: 'uppercase' }}
                  onClick={focusDelivery}
                >
                  ДОБАВИТЬ ДОСТАВКУ +
                </Button>
              </Box>
              <Grid container spacing={3}>
                <Grid size={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="order-delivery-service-label">Способ доставки</InputLabel>
                    <Select
                      labelId="order-delivery-service-label"
                      id="order-delivery-service"
                      displayEmpty
                      label="Способ доставки"
                      inputRef={deliverySelectRef}
                      value={order.delivery_service || ''}
                      onChange={(e) =>
                        handleChange('delivery_service', e.target.value || null)
                      }
                    >
                      <MenuItem value="">Не указан</MenuItem>
                      {deliveryServices.map((ds) => (
                        <MenuItem key={ds.id} value={ds.id}>
                          {ds.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Трек-номер"
                    value={order.tracking_number || ''}
                    onChange={(e) => handleChange('tracking_number', e.target.value)}
                  />
                </Grid>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    disabled
                    label="Дата завершения"
                    InputLabelProps={{ shrink: true }}
                    value={order.completed_at ? order.completed_at.substring(0, 10) : ''}
                  />
                </Grid>
              </Grid>
            </Box>

            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 3,
                }}
              >
                <Typography variant="h5">Клиент</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    color="secondary"
                    sx={{ textTransform: 'uppercase' }}
                    disabled={!order.client}
                    onClick={() => {
                      setNewPhone('');
                      setOpenPhoneModal(true);
                    }}
                  >
                    ДОБАВИТЬ ДОП. ТЕЛЕФОН +
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    sx={{ textTransform: 'uppercase' }}
                    onClick={openClientPicker}
                  >
                    ВЫБРАТЬ КЛИЕНТА +
                  </Button>
                </Box>
              </Box>
              <Grid container spacing={3}>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="ФИО"
                    disabled
                    value={clientDisplayName}
                  />
                </Grid>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Скидка клиента (%)"
                    type="number"
                    value={order.discount_percent || 0}
                    onChange={(e) => handleChange('discount_percent', e.target.value)}
                  />
                </Grid>
              </Grid>
            </Box>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3, minHeight: 300 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 3,
                }}
              >
                <Typography variant="h5">Товар</Typography>
                <Button
                  variant="outlined"
                  color="secondary"
                  sx={{ textTransform: 'uppercase' }}
                  disabled={isTerminal || isNew || mutatingItems}
                  onClick={() => setOpenProductDialog(true)}
                >
                  ДОБАВИТЬ ТОВАР +
                </Button>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox size="small" disabled />
                      </TableCell>
                      <TableCell>ID товара / Артикул</TableCell>
                      <TableCell>Кол-во</TableCell>
                      <TableCell>Цена без НДС</TableCell>
                      <TableCell>НДС %</TableCell>
                      <TableCell align="right">Сумма с НДС</TableCell>
                      <TableCell align="right">Действия</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.items && order.items.length > 0 ? (
                      order.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell padding="checkbox">
                            <Checkbox size="small" disabled />
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2">{item.product_name}</Typography>
                              <Typography variant="caption" sx={{
                                color: "text.secondary"
                              }}>
                                {item.product_sku}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ minWidth: 100 }}>
                            {isTerminal ? (
                              `${item.quantity} шт.`
                            ) : (
                              <TextField
                                size="small"
                                type="number"
                                slotProps={{ htmlInput: { min: 1, style: { width: 64 } } }}
                                defaultValue={item.quantity}
                                key={`${item.id}-${item.quantity}`}
                                disabled={mutatingItems}
                                onBlur={(e) => handleQtyChange(item, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.target.blur();
                                  }
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell>{formatCurrency(item.price)}</TableCell>
                          <TableCell>{item.vat_rate}%</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatCurrency(item.line_total)}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              color="error"
                              disabled={isTerminal || mutatingItems}
                              onClick={() => handleDeleteItem(item)}
                            >
                              Удалить
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3, color: '#718096' }}>
                          Нет добавленных товаров
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 3,
                }}
              >
                <Typography variant="h5">Оплата</Typography>
                <Button
                  variant="outlined"
                  color="secondary"
                  sx={{ textTransform: 'uppercase' }}
                  disabled={isTerminal || isNew || paymentSaving}
                  onClick={handleAddPayment}
                >
                  ДОБАВИТЬ ОПЛАТУ +
                </Button>
              </Box>

              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid size={5}>
                  <Select
                    fullWidth
                    size="small"
                    displayEmpty
                    value={paymentType}
                    disabled={isTerminal || isNew}
                    onChange={(e) => setPaymentType(e.target.value)}
                  >
                    <MenuItem value="" disabled>
                      Способ оплаты
                    </MenuItem>
                    {paymentTypes.map((pt) => (
                      <MenuItem key={pt.id} value={pt.id}>
                        {pt.name}
                      </MenuItem>
                    ))}
                  </Select>
                </Grid>
                <Grid size={5}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Сумма, BYN"
                    type="number"
                    value={paymentAmount}
                    disabled={isTerminal || isNew}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">BYN</InputAdornment>
                        ),
                      },
                    }}
                  />
                </Grid>
              </Grid>

              {payments.length > 0 ? (
                <TableContainer sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Способ оплаты</TableCell>
                        <TableCell align="right">Сумма</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{paymentTypeName(p.payment_type)}</TableCell>
                          <TableCell align="right">{formatCurrency(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography
                  variant="body2"
                  sx={{
                    color: "text.secondary",
                    mb: 3
                  }}>
                  Платежей пока нет
                </Typography>
              )}

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid #EDF2F7',
                  pt: 3,
                  mt: 2,
                  flexWrap: 'wrap',
                  gap: 2,
                }}
              >
                <Typography variant="h4" sx={{ display: 'flex', gap: 2, alignItems: 'baseline' }}>
                  Итого:{' '}
                  <Box component="span" sx={{ color: '#CC5E33', fontWeight: 600 }}>
                    {formatCurrency(orderTotal)}
                  </Box>
                </Typography>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="body1">
                    Оплачено:{' '}
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {formatCurrency(paidTotal)}
                    </Box>
                  </Typography>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    Остаток: {formatCurrency(remaining)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      <ProductSearchModal
        open={openProductDialog}
        onClose={() => setOpenProductDialog(false)}
        onAdd={handleAddProducts}
        categories={catalogProducts
          .map((p) => (p.category_name ? { id: p.category, name: p.category_name } : null))
          .filter((v, i, a) => a.findIndex((t) => t && t.id === v?.id) === i && v)}
      />

      <Dialog
        open={openClientModal}
        onClose={() => setOpenClientModal(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle>Выбрать клиента</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            placeholder="Поиск по имени, email, телефону"
            value={clientSearch}
            sx={{ mt: 1, mb: 2 }}
            onChange={(e) => setClientSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') searchClients(clientSearch);
            }}
            slotProps={{
              input: {
                endAdornment: (
                  <Button size="small" onClick={() => searchClients(clientSearch)}>
                    Найти
                  </Button>
                ),
              },
            }}
          />
          {clientSearchLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
              {clientResults.length === 0 ? (
                <Typography
                  sx={{
                    color: "text.secondary",
                    px: 2,
                    py: 2
                  }}>
                  Клиенты не найдены
                </Typography>
              ) : (
                clientResults.map((c) => (
                  <ListItemButton key={c.id} onClick={() => selectClient(c)}>
                    <ListItemText
                      primary={`${c.first_name || ''} ${c.last_name || ''}`.trim() || `Клиент #${c.id}`}
                      secondary={c.primary_phone || c.email || undefined}
                    />
                  </ListItemButton>
                ))
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenClientModal(false)}>Отмена</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openPhoneModal}
        onClose={() => setOpenPhoneModal(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle>Добавить доп. телефон</DialogTitle>
        <DialogContent>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Клиент: {clientDisplayName}
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Номер телефона"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="+375..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenPhoneModal(false)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={phoneSaving}
            onClick={handleAddPhone}
          >
            {phoneSaving ? <CircularProgress size={20} color="inherit" /> : 'Сохранить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrderDetail;
