import {
  Alert, Box, Paper, Grid, Typography, Button, TextField, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, Dialog,
  DialogTitle, DialogContent, DialogActions, CircularProgress, List, ListItemButton,
  ListItemText, InputAdornment,
} from '@mui/material';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { extractApiError, formatCurrency } from '../utils';
import ProductPreviewTooltip from '../components/ProductPreviewTooltip';
import ProductSearchModal from '../components/ProductSearchModal';
import SearchableSelect from '../components/SearchableSelect';
import { useFeedback } from '../hooks/useFeedback';

const ORDER_STATUSES = [
  { value: 'reserved', label: 'Резерв' },
  { value: 'confirmed', label: 'Подтвержден' },
  { value: 'in_delivery', label: 'В доставке' },
  { value: 'completed', label: 'Завершен' },
  { value: 'cancelled', label: 'Отменен' },
];

const BASE_WRITABLE_FIELDS = [
  'order_date',
  'sales_channel',
  'client',
  'discount_percent',
  'comment',
  'delivery_service',
  'tracking_number',
  'status',
];

const writableFields = (includeSeller) => (
  includeSeller ? [...BASE_WRITABLE_FIELDS, 'seller'] : BASE_WRITABLE_FIELDS
);

const emptyNewOrder = () => ({
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

const normalizeEmpty = (field, value) => {
  if (
    (field === 'sales_channel' || field === 'delivery_service' || field === 'client' || field === 'seller')
    && (value === '' || value === undefined)
  ) {
    return null;
  }
  return value;
};

const pickWritable = (order, includeSeller) => {
  const payload = {};
  for (const field of writableFields(includeSeller)) {
    const value = normalizeEmpty(field, order[field]);
    if (value !== undefined) payload[field] = value;
  }
  return payload;
};

const diffWritable = (current, baseline, includeSeller) => {
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

const formatUserName = (user) => (
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.username || '—'
);

const clientIdOf = (orderLike) => {
  const value = orderLike?.client;
  if (value && typeof value === 'object') {
    return value.id ?? value.pk ?? null;
  }
  return value || null;
};

const isGrillProduct = (product) => String(product?.category_code || '').trim() === 'A';

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { notify, confirm } = useFeedback();

  const tabFromUrl = Number(searchParams.get('tab') || '0');
  const tab = tabFromUrl === 1 ? 1 : 0;

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', String(next));
    setSearchParams(params, { replace: true });
  };

  const [order, setOrder] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [channels, setChannels] = useState([]);
  const [deliveryServices, setDeliveryServices] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mutatingItems, setMutatingItems] = useState(false);
  const userRole = localStorage.getItem('user_role');
  const isManager = userRole === 'manager';

  const [openProductDialog, setOpenProductDialog] = useState(false);
  const [openClientModal, setOpenClientModal] = useState(false);
  const [openNewClientModal, setOpenNewClientModal] = useState(false);
  const [openGrillClientModal, setOpenGrillClientModal] = useState(false);
  const [pendingGrillProducts, setPendingGrillProducts] = useState([]);
  const [grillForm, setGrillForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [grillSaving, setGrillSaving] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [selectedClientName, setSelectedClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientPhoneId, setClientPhoneId] = useState(null);
  const [phoneSaving, setPhoneSaving] = useState(false);

  const [newClientForm, setNewClientForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [newClientSaving, setNewClientSaving] = useState(false);
  const [draftDeliveries, setDraftDeliveries] = useState([]);
  const [mutatingDeliveries, setMutatingDeliveries] = useState(false);

  const [paymentType, setPaymentType] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);

  const isTerminal = order?.status === 'completed' || order?.status === 'cancelled';
  const isNew = id === 'new';
  const canDeleteOrder = isManager && !isNew && !isTerminal;
  const clientIdFromUrl = searchParams.get('client');
  const openProductsFromUrl = searchParams.get('add') === '1';
  const newDraftReady = useRef(false);
  const openedAddFromUrl = useRef(false);

  const isDirty = useMemo(() => {
    if (!order) return false;
    if (isNew) {
      return Boolean(order.order_date || order.sales_channel || order.client || order.seller || order.comment);
    }
    if (!baseline) return false;
    return Object.keys(diffWritable(order, baseline, isManager)).length > 0;
  }, [order, baseline, isNew, isManager]);

  useEffect(() => {
    if (!isDirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const refreshOrder = useCallback(async () => {
    if (isNew) return;
    const orderRes = await api.get(`/orders/orders/${id}/`);
    setOrder(orderRes.data);
    setBaseline(orderRes.data);
    if (orderRes.data.client_name) {
      setSelectedClientName(
        `${orderRes.data.client_name} ${orderRes.data.client_last_name || ''}`.trim()
      );
    } else {
      setSelectedClientName('');
    }
    setClientPhone(orderRes.data.client_phone || '');
    setClientPhoneId(orderRes.data.client_phone_id || null);
  }, [id, isNew]);

  useEffect(() => {
    let cancelled = false;
    const loadCatalogs = async () => {
      const [channelRes, deliveryRes, paymentRes, productsRes, usersRes] = await Promise.all([
        api.get('/orders/sales_channels/').catch(() => ({ data: [] })),
        api.get('/orders/delivery_services/').catch(() => ({ data: [] })),
        api.get('/orders/payment_types/').catch(() => ({ data: [] })),
        api.get('/catalog/product_cards/').catch(() => ({ data: [] })),
        isManager
          ? api.get('/users/users/?page_size=100').catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      setChannels(channelRes.data.results || channelRes.data || []);
      setDeliveryServices(deliveryRes.data.results || deliveryRes.data || []);
      setPaymentTypes(paymentRes.data.results || paymentRes.data || []);
      setCatalogProducts(productsRes.data.results || productsRes.data || []);
      setSellers((usersRes.data.results || usersRes.data || []).filter((u) => u.is_active !== false));
    };
    loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  useEffect(() => {
    if (id !== 'new') newDraftReady.current = false;
    openedAddFromUrl.current = false;
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const loadOrder = async () => {
      setLoadError(null);
      if (isNew) {
        if (newDraftReady.current) return;
        const initial = emptyNewOrder();
        const clientId = clientIdFromUrl;
        if (clientId) {
          initial.client = Number(clientId) || clientId;
          try {
            const clientRes = await api.get(`/clients/clients/${clientId}/`);
            if (cancelled) return;
            setSelectedClientName(
              `${clientRes.data.first_name || ''} ${clientRes.data.last_name || ''}`.trim()
            );
            setClientPhone(clientRes.data.primary_phone || '');
            if (clientRes.data.discount_percent != null) {
              initial.discount_percent = clientRes.data.discount_percent;
            }
          } catch {
            if (cancelled) return;
            setSelectedClientName(`Клиент #${clientId}`);
          }
        } else {
          setSelectedClientName('');
          setClientPhone('');
          setClientPhoneId(null);
        }
        if (cancelled) return;
        newDraftReady.current = true;
        setOrder(initial);
        setBaseline(null);
        setDraftDeliveries([]);
        return;
      }
      try {
        const orderRes = await api.get(`/orders/orders/${id}/`);
        if (cancelled) return;
        setOrder(orderRes.data);
        setBaseline(orderRes.data);
        if (orderRes.data.client_name) {
          setSelectedClientName(
            `${orderRes.data.client_name} ${orderRes.data.client_last_name || ''}`.trim()
          );
        } else {
          setSelectedClientName('');
        }
        setClientPhone(orderRes.data.client_phone || '');
        setClientPhoneId(orderRes.data.client_phone_id || null);
      } catch (err) {
        if (cancelled) return;
        setOrder(null);
        setLoadError(extractApiError(err) || 'Не удалось загрузить заказ');
      }
    };
    if (id) loadOrder();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, clientIdFromUrl]);

  useEffect(() => {
    if (isNew || !order || !openProductsFromUrl || openedAddFromUrl.current) return undefined;
    openedAddFromUrl.current = true;
    setOpenProductDialog(true);
    const params = new URLSearchParams(searchParams);
    params.delete('add');
    setSearchParams(params, { replace: true });
    return undefined;
  }, [isNew, order, openProductsFromUrl, searchParams, setSearchParams]);

  const handleChange = (field, value) => {
    setOrder((prev) => ({ ...prev, [field]: value }));
  };

  const handleStatusChange = async (nextStatus) => {
    if (nextStatus === order.status) return;
    if (nextStatus === 'cancelled') {
      if (!(await confirm('Отменить заказ?'))) return;
    }

    if (isNew) {
      handleChange('status', nextStatus);
      return;
    }

    // Prefer status-only PATCH when nothing else is dirty besides status
    const otherDiff = diffWritable({ ...order, status: baseline?.status }, baseline, isManager);
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

  const persistNewOrder = async () => {
    if (!order.order_date) {
      notify('Укажите дату заказа', 'warning');
      return null;
    }
    const payload = pickWritable(order, isManager);
    if (!payload.client) delete payload.client;
    if (!payload.delivery_service) delete payload.delivery_service;
    const res = await api.post('/orders/orders/', payload);
    const newId = res.data.id;
    for (const row of draftDeliveries) {
      if (!row.delivery_service) continue;
      await api.post('/orders/order_deliveries/', {
        order: newId,
        delivery_service: row.delivery_service,
        tracking_number: row.tracking_number || '',
        delivery_date: row.delivery_date || null,
      });
    }
    return newId;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const newId = await persistNewOrder();
        if (!newId) return;
        notify('Новый заказ создан', 'success');
        navigate(`/orders/${newId}`);
      } else {
        const payload = diffWritable(order, baseline, isManager);
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
      notify(`Не удалось найти клиентов:\n${extractApiError(err)}`, 'error');
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

  const loadClientPhone = async (clientId, fallbackNumber = '') => {
    if (!clientId) {
      setClientPhone(fallbackNumber);
      setClientPhoneId(null);
      return;
    }
    try {
      const res = await api.get('/clients/client_phones/', { params: { client: clientId } });
      const phones = res.data.results || res.data || [];
      const primary = phones.find((p) => p.is_primary) || phones[0];
      setClientPhone(primary?.number || fallbackNumber);
      setClientPhoneId(primary?.id || null);
    } catch {
      setClientPhone(fallbackNumber);
      setClientPhoneId(null);
    }
  };

  const selectClient = (client) => {
    handleChange('client', client.id);
    setSelectedClientName(`${client.first_name || ''} ${client.last_name || ''}`.trim());
    if (client.discount_percent != null) {
      handleChange('discount_percent', client.discount_percent);
    }
    setOpenClientModal(false);
    setOpenNewClientModal(false);
    loadClientPhone(client.id, client.primary_phone || '');
  };

  const saveClientPhone = async () => {
    if (!order?.client) return;
    const number = clientPhone.trim();
    setPhoneSaving(true);
    try {
      if (!number) {
        notify('Введите номер телефона', 'warning');
        return;
      }
      if (clientPhoneId) {
        await api.patch(`/clients/client_phones/${clientPhoneId}/`, { number });
      } else {
        const res = await api.post('/clients/client_phones/', {
          client: order.client,
          number,
          is_primary: true,
        });
        setClientPhoneId(res.data.id);
      }
    } catch (err) {
      notify(`Не удалось сохранить телефон:\n${extractApiError(err)}`, 'error');
    } finally {
      setPhoneSaving(false);
    }
  };

  const submitNewClient = async () => {
    const firstName = newClientForm.first_name.trim();
    const phone = newClientForm.phone.trim();
    if (!firstName || !phone) {
      notify('Укажите имя и телефон клиента', 'warning');
      return;
    }
    setNewClientSaving(true);
    try {
      const created = await api.post('/clients/clients/', {
        first_name: firstName,
        last_name: newClientForm.last_name.trim(),
        phone,
      });
      selectClient(created.data);
      notify('Клиент создан', 'success');
    } catch (err) {
      notify(`Не удалось создать клиента:\n${extractApiError(err)}`, 'error');
    } finally {
      setNewClientSaving(false);
    }
  };

  const addDeliveryRow = () => {
    setDraftDeliveries((prev) => [
      ...prev,
      { tempId: `draft-${Date.now()}`, delivery_service: '', tracking_number: '', delivery_date: '' },
    ]);
  };

  const persistDraftDelivery = async (row) => {
    if (isNew || !row.delivery_service) return;
    setMutatingDeliveries(true);
    try {
      await api.post('/orders/order_deliveries/', {
        order: id,
        delivery_service: row.delivery_service,
        tracking_number: row.tracking_number || '',
        delivery_date: row.delivery_date || null,
      });
      setDraftDeliveries((prev) => prev.filter((item) => item.tempId !== row.tempId));
      await refreshOrder();
    } catch (err) {
      notify(`Не удалось сохранить доставку:\n${extractApiError(err)}`, 'error');
    } finally {
      setMutatingDeliveries(false);
    }
  };

  const updateDraftDelivery = (tempId, field, value) => {
    setDraftDeliveries((prev) => prev.map((row) => (
      row.tempId === tempId ? { ...row, [field]: value } : row
    )));
  };

  const handleDeliveryServiceChange = async (row, value) => {
    if (row.tempId) {
      updateDraftDelivery(row.tempId, 'delivery_service', value);
      if (value && !isNew) {
        await persistDraftDelivery({ ...row, delivery_service: value });
      }
      return;
    }
    setMutatingDeliveries(true);
    try {
      await api.patch(`/orders/order_deliveries/${row.id}/`, { delivery_service: value });
      await refreshOrder();
    } catch (err) {
      notify(`Не удалось сохранить доставку:\n${extractApiError(err)}`, 'error');
    } finally {
      setMutatingDeliveries(false);
    }
  };

  const handleDeliveryTrackingBlur = async (row, value) => {
    const tracking = value.trim();
    if (row.tempId) {
      updateDraftDelivery(row.tempId, 'tracking_number', tracking);
      return;
    }
    if (tracking === (row.tracking_number || '')) return;
    setMutatingDeliveries(true);
    try {
      await api.patch(`/orders/order_deliveries/${row.id}/`, { tracking_number: tracking });
      await refreshOrder();
    } catch (err) {
      notify(`Не удалось сохранить трек-номер:\n${extractApiError(err)}`, 'error');
      await refreshOrder();
    } finally {
      setMutatingDeliveries(false);
    }
  };

  const handleDeliveryDateBlur = async (row, value) => {
    const deliveryDate = value || null;
    if (row.tempId) {
      updateDraftDelivery(row.tempId, 'delivery_date', deliveryDate || '');
      return;
    }
    if ((row.delivery_date || null) === deliveryDate) return;
    setMutatingDeliveries(true);
    try {
      await api.patch(`/orders/order_deliveries/${row.id}/`, { delivery_date: deliveryDate });
      await refreshOrder();
    } catch (err) {
      notify(`Не удалось сохранить дату доставки:\n${extractApiError(err)}`, 'error');
      await refreshOrder();
    } finally {
      setMutatingDeliveries(false);
    }
  };

  const handleDeleteDelivery = async (row) => {
    if (row.tempId) {
      setDraftDeliveries((prev) => prev.filter((item) => item.tempId !== row.tempId));
      return;
    }
    setMutatingDeliveries(true);
    try {
      await api.delete(`/orders/order_deliveries/${row.id}/`);
      await refreshOrder();
    } catch (err) {
      notify(`Не удалось удалить доставку:\n${extractApiError(err)}`, 'error');
    } finally {
      setMutatingDeliveries(false);
    }
  };

  const persistAssignedClient = async (currentOrder) => {
    const clientId = clientIdOf(currentOrder);
    if (isNew || !clientId) return clientId;
    if (String(clientId) === String(clientIdOf(baseline))) return clientId;
    const res = await api.patch(`/orders/orders/${id}/`, { client: clientId });
    setOrder(res.data);
    setBaseline(res.data);
    if (res.data.client_name) {
      setSelectedClientName(
        `${res.data.client_name} ${res.data.client_last_name || ''}`.trim()
      );
    }
    setClientPhone(res.data.client_phone || clientPhone);
    setClientPhoneId(res.data.client_phone_id || clientPhoneId);
    return clientIdOf(res.data);
  };

  const addProductsToOrder = async (selectedProducts) => {
    if (isTerminal) {
      notify('Нельзя изменять товары в завершённом или отменённом заказе', 'warning');
      return;
    }
    setMutatingItems(true);
    try {
      for (const product of selectedProducts) {
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
      notify(`Ошибка при добавлении товаров:\n${extractApiError(err)}`, 'error');
      await refreshOrder();
    } finally {
      setMutatingItems(false);
    }
  };

  const handleAddProducts = async (selectedProducts) => {
    let clientId = clientIdOf(order);
    try {
      clientId = await persistAssignedClient(order);
    } catch (err) {
      notify(`Не удалось сохранить клиента:\n${extractApiError(err)}`, 'error');
      return;
    }
    const hasGrill = selectedProducts.some(isGrillProduct);
    if (hasGrill && !clientId) {
      setPendingGrillProducts(selectedProducts);
      setGrillForm({ first_name: '', last_name: '', phone: '' });
      setOpenGrillClientModal(true);
      return;
    }
    await addProductsToOrder(selectedProducts);
  };

  const submitGrillClient = async () => {
    if (clientIdOf(order)) {
      const products = pendingGrillProducts;
      setOpenGrillClientModal(false);
      setPendingGrillProducts([]);
      await addProductsToOrder(products);
      return;
    }
    const firstName = grillForm.first_name.trim();
    const lastName = grillForm.last_name.trim();
    const phone = grillForm.phone.trim();
    if (!firstName || !phone) {
      notify('Укажите имя и телефон клиента', 'warning');
      return;
    }
    setGrillSaving(true);
    try {
      let client = null;
      const searchRes = await api.get('/clients/clients/', { params: { search: phone } });
      const found = (searchRes.data.results || searchRes.data || []).find(
        (c) => c.primary_phone === phone || (c.phones || []).some((p) => p.number === phone)
      );
      if (found) {
        client = found;
      } else {
        const created = await api.post('/clients/clients/', {
          first_name: firstName,
          last_name: lastName,
          phone,
        });
        client = created.data;
      }
      await api.patch(`/orders/orders/${id}/`, { client: client.id });
      handleChange('client', client.id);
      setSelectedClientName(`${client.first_name || ''} ${client.last_name || ''}`.trim());
      if (client.discount_percent != null) {
        handleChange('discount_percent', client.discount_percent);
      }
      await loadClientPhone(client.id, phone);
      setOpenGrillClientModal(false);
      const products = pendingGrillProducts;
      setPendingGrillProducts([]);
      await addProductsToOrder(products);
    } catch (err) {
      notify(`Не удалось сохранить клиента:\n${extractApiError(err)}`, 'error');
    } finally {
      setGrillSaving(false);
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
  const deliveryRows = [...(order.deliveries || []), ...draftDeliveries];
  const paidTotal = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const orderTotal = parseFloat(order.total || 0);
  const remaining = Math.max(0, orderTotal - paidTotal);

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
                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    required
                    label="Дата заказа"
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={order.order_date || ''}
                    onChange={(e) => handleChange('order_date', e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <SearchableSelect
                    id="order-sales-channel"
                    label="Канал привлечения"
                    placeholder="Выберите канал"
                    value={order.sales_channel || ''}
                    onChange={(value) => handleChange('sales_channel', value)}
                    options={channels.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  {isManager ? (
                    <SearchableSelect
                      id="order-seller"
                      label="Продавец"
                      placeholder="Выберите продавца"
                      value={order.seller || ''}
                      onChange={(value) => handleChange('seller', value)}
                      options={sellers.map((u) => ({ value: u.id, label: formatUserName(u) }))}
                    />
                  ) : (
                    <TextField
                      fullWidth
                      size="small"
                      label="Продавец"
                      value={order.seller_name || ''}
                      slotProps={{ inputLabel: { shrink: true } }}
                      disabled
                    />
                  )}
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <SearchableSelect
                    id="order-status"
                    label="Статус"
                    required
                    filterable={false}
                    disabled={saving || isTerminal}
                    value={order.status || 'reserved'}
                    onChange={(value) => handleStatusChange(value)}
                    options={ORDER_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                  />
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
                  disabled={isTerminal || mutatingDeliveries}
                  onClick={addDeliveryRow}
                >
                  ДОБАВИТЬ ДОСТАВКУ +
                </Button>
              </Box>
              {deliveryRows.length === 0 ? (
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                  Доставка не указана
                </Typography>
              ) : (
                deliveryRows.map((row) => (
                  <Grid
                    container
                    spacing={2}
                    wrap="nowrap"
                    alignItems="center"
                    key={row.id || row.tempId}
                    sx={{ mb: 2 }}
                  >
                    <Grid size={4}>
                      <SearchableSelect
                        id={`order-delivery-service-${row.id || row.tempId}`}
                        label="Способ доставки"
                        disabled={isTerminal || mutatingDeliveries}
                        value={row.delivery_service || ''}
                        onChange={(value) => handleDeliveryServiceChange(row, value || null)}
                        options={deliveryServices.map((ds) => ({ value: ds.id, label: ds.name }))}
                        disableClearable
                      />
                    </Grid>
                    <Grid size={3}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Трек-номер"
                        defaultValue={row.tracking_number || ''}
                        key={`${row.id || row.tempId}-${row.tracking_number || ''}`}
                        disabled={isTerminal || mutatingDeliveries}
                        onBlur={(e) => handleDeliveryTrackingBlur(row, e.target.value)}
                      />
                    </Grid>
                    <Grid size={3}>
                      <TextField
                        fullWidth
                        size="small"
                        type="date"
                        label="Дата доставки"
                        defaultValue={row.delivery_date || ''}
                        key={`${row.id || row.tempId}-date-${row.delivery_date || ''}`}
                        disabled={isTerminal || mutatingDeliveries}
                        onBlur={(e) => handleDeliveryDateBlur(row, e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Grid>
                    <Grid size="auto" sx={{ flexShrink: 0 }}>
                      <Button
                        size="small"
                        color="error"
                        disabled={isTerminal || mutatingDeliveries}
                        onClick={() => handleDeleteDelivery(row)}
                      >
                        Удалить
                      </Button>
                    </Grid>
                  </Grid>
                ))
              )}
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
                    onClick={() => {
                      setNewClientForm({ first_name: '', last_name: '', phone: '' });
                      setOpenNewClientModal(true);
                    }}
                  >
                    НОВЫЙ КЛИЕНТ +
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
                    label="Телефон"
                    placeholder="+375..."
                    disabled={!order.client || phoneSaving}
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    onBlur={() => {
                      if (order.client) saveClientPhone();
                    }}
                  />
                </Grid>
                <Grid size={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Скидка (%)"
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
                  disabled={isTerminal || mutatingItems || saving}
                  onClick={async () => {
                    if (!isNew) {
                      try {
                        await persistAssignedClient(order);
                      } catch (err) {
                        notify(`Не удалось сохранить клиента:\n${extractApiError(err)}`, 'error');
                        return;
                      }
                      setOpenProductDialog(true);
                      return;
                    }
                    setSaving(true);
                    try {
                      const newId = await persistNewOrder();
                      if (!newId) return;
                      notify('Новый заказ создан', 'success');
                      navigate(`/orders/${newId}?tab=1&add=1`, { replace: true });
                    } catch (err) {
                      notify(`Ошибка при сохранении:\n${extractApiError(err)}`, 'error');
                    } finally {
                      setSaving(false);
                    }
                  }}
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
                            <ProductPreviewTooltip product={item}>
                              <Box>
                                <Typography variant="body2">{item.product_name}</Typography>
                                <Typography variant="caption" sx={{
                                  color: "text.secondary"
                                }}>
                                  {item.product_sku}
                                </Typography>
                              </Box>
                            </ProductPreviewTooltip>
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
                  <SearchableSelect
                    id="order-payment-type"
                    label="Способ оплаты"
                    placeholder="Способ оплаты"
                    disabled={isTerminal || isNew}
                    value={paymentType}
                    onChange={setPaymentType}
                    options={paymentTypes.map((pt) => ({ value: pt.id, label: pt.name }))}
                  />
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
          <Button
            variant="contained"
            onClick={() => {
              setOpenClientModal(false);
              setNewClientForm({
                first_name: '',
                last_name: '',
                phone: clientSearch.trim().startsWith('+') || /^\d/.test(clientSearch.trim())
                  ? clientSearch.trim()
                  : '',
              });
              setOpenNewClientModal(true);
            }}
          >
            Новый клиент
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openNewClientModal}
        onClose={() => {
          if (newClientSaving) return;
          setOpenNewClientModal(false);
        }}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle>Новый клиент</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            fullWidth
            size="small"
            required
            label="Имя"
            value={newClientForm.first_name}
            onChange={(e) => setNewClientForm((prev) => ({ ...prev, first_name: e.target.value }))}
          />
          <TextField
            fullWidth
            size="small"
            label="Фамилия"
            value={newClientForm.last_name}
            onChange={(e) => setNewClientForm((prev) => ({ ...prev, last_name: e.target.value }))}
          />
          <TextField
            fullWidth
            size="small"
            required
            label="Телефон"
            value={newClientForm.phone}
            onChange={(e) => setNewClientForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+375..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNewClientModal(false)} disabled={newClientSaving}>
            Отмена
          </Button>
          <Button variant="contained" disabled={newClientSaving} onClick={submitNewClient}>
            {newClientSaving ? <CircularProgress size={20} color="inherit" /> : 'Создать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openGrillClientModal}
        onClose={() => {
          if (grillSaving) return;
          setOpenGrillClientModal(false);
          setPendingGrillProducts([]);
        }}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3 } } }}
      >
        <DialogTitle>Клиент для продажи гриля</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            При продаже гриля укажите имя и телефон клиента.
          </Typography>
          <TextField
            fullWidth
            size="small"
            required
            label="Имя"
            value={grillForm.first_name}
            onChange={(e) => setGrillForm((prev) => ({ ...prev, first_name: e.target.value }))}
          />
          <TextField
            fullWidth
            size="small"
            label="Фамилия"
            value={grillForm.last_name}
            onChange={(e) => setGrillForm((prev) => ({ ...prev, last_name: e.target.value }))}
          />
          <TextField
            fullWidth
            size="small"
            required
            label="Телефон"
            value={grillForm.phone}
            onChange={(e) => setGrillForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+375..."
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setOpenGrillClientModal(false);
              setPendingGrillProducts([]);
            }}
            disabled={grillSaving}
          >
            Отмена
          </Button>
          <Button variant="contained" disabled={grillSaving} onClick={submitGrillClient}>
            {grillSaving ? <CircularProgress size={20} color="inherit" /> : 'Сохранить и добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrderDetail;
