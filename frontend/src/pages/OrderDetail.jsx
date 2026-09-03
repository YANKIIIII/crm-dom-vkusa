import {
  Alert, Box, Paper, Typography, Button, CircularProgress,
} from '@mui/material';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api';
import { extractApiError, CATALOG_PAGE_SIZE, mapOrderStatuses, isTerminalOrderStatus, unwrapList } from '../utils';
import ProductSearchModal from '../components/ProductSearchModal';
import ClientPickerDialog from '../components/ClientPickerDialog';
import { useFeedback } from '../hooks/useFeedback';
import {
  emptyNewOrder, pickWritable, diffWritable, clientIdOf, isGrillProduct,
} from './orderDetail/utils';
import OrderDataTab from './orderDetail/OrderDataTab';
import OrderItemsTab from './orderDetail/OrderItemsTab';
import GrillClientDialog from './orderDetail/GrillClientDialog';

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
  const [orderStatuses, setOrderStatuses] = useState(() => mapOrderStatuses([]));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mutatingItems, setMutatingItems] = useState(false);
  const userRole = localStorage.getItem('user_role');
  const isManager = userRole === 'manager';

  const [openProductDialog, setOpenProductDialog] = useState(false);
  const [openClientModal, setOpenClientModal] = useState(false);
  const [openGrillClientModal, setOpenGrillClientModal] = useState(false);
  const [pendingGrillProducts, setPendingGrillProducts] = useState([]);
  const [grillForm, setGrillForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [grillSaving, setGrillSaving] = useState(false);

  const [selectedClientName, setSelectedClientName] = useState('');
  const [clientPhones, setClientPhones] = useState([]);
  const [draftPhone, setDraftPhone] = useState(null);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [draftDeliveries, setDraftDeliveries] = useState([]);
  const [dirtyDeliveryIds, setDirtyDeliveryIds] = useState(new Set());
  const [mutatingDeliveries, setMutatingDeliveries] = useState(false);

  const [paymentType, setPaymentType] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [draftPayments, setDraftPayments] = useState([]);

  const isTerminal = isTerminalOrderStatus(order?.status, orderStatuses);
  const isNew = id === 'new';
  const currentClientId = clientIdOf(order);
  const canDeleteOrder = isManager && !isNew && !isTerminal;
  const clientIdFromUrl = searchParams.get('client');
  const openProductsFromUrl = searchParams.get('add') === '1';
  const newDraftReady = useRef(false);
  const openedAddFromUrl = useRef(false);
  const createdOrderIdRef = useRef(null);

  const isDirty = useMemo(() => {
    if (!order) return false;
    if (isNew) {
      return Boolean(order.order_date || order.sales_channel || order.client || order.seller || order.comment);
    }
    if (!baseline) return false;
    if (draftPayments.length > 0) return true;
    if (draftDeliveries.length > 0) return true;
    if (dirtyDeliveryIds.size > 0) return true;
    return Object.keys(diffWritable(order, baseline, isManager)).length > 0;
  }, [order, baseline, isNew, isManager, draftPayments, draftDeliveries, dirtyDeliveryIds]);

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
  }, [id, isNew]);

  useEffect(() => {
    let cancelled = false;
    const loadCatalogs = async () => {
      const catalogParams = { params: { page_size: CATALOG_PAGE_SIZE } };
      const [channelRes, deliveryRes, paymentRes, productsRes, usersRes, statusRes] = await Promise.all([
        api.get('/orders/sales_channels/', catalogParams).catch(() => ({ data: [] })),
        api.get('/orders/delivery_services/', catalogParams).catch(() => ({ data: [] })),
        api.get('/orders/payment_types/', catalogParams).catch(() => ({ data: [] })),
        api.get('/catalog/product_cards/', catalogParams).catch(() => ({ data: [] })),
        isManager
          ? api.get('/users/users/', catalogParams).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        api.get('/orders/order_statuses/', catalogParams).catch(() => ({ data: [] })),
      ]);
      if (cancelled) return;
      setChannels(unwrapList(channelRes.data));
      setDeliveryServices(unwrapList(deliveryRes.data));
      setPaymentTypes(unwrapList(paymentRes.data));
      setCatalogProducts(unwrapList(productsRes.data));
      setSellers(unwrapList(usersRes.data).filter((u) => u.is_active !== false));
      setOrderStatuses(mapOrderStatuses(unwrapList(statusRes.data)));
    };
    loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, [isManager]);

  useEffect(() => {
    if (id !== 'new') {
      newDraftReady.current = false;
      createdOrderIdRef.current = null;
    }
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
            if (clientRes.data.discount_percent != null) {
              initial.discount_percent = clientRes.data.discount_percent;
            }
          } catch {
            if (cancelled) return;
            setSelectedClientName(`Клиент #${clientId}`);
          }
        } else {
          setSelectedClientName('');
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
    let cancelled = false;
    if (!currentClientId) {
      setClientPhones([]);
      setDraftPhone(null);
      return undefined;
    }
    api.get('/clients/client_phones/', { params: { client: currentClientId } })
      .then((response) => {
        if (cancelled) return;
        setClientPhones(unwrapList(response.data));
        setDraftPhone(null);
      })
      .catch(() => {
        if (!cancelled) setClientPhones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentClientId]);

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
    const nextKind = orderStatuses.find((s) => s.value === nextStatus)?.kind;
    if (nextKind === 'cancelled' || nextStatus === 'cancelled') {
      if (!(await confirm('Отменить заказ?'))) return;
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
    let newId = createdOrderIdRef.current;
    if (!newId) {
      const res = await api.post('/orders/orders/', payload);
      newId = res.data.id;
      createdOrderIdRef.current = newId;
    }
    for (const row of draftDeliveries) {
      if (!row.delivery_service || row.id) continue;
      const created = await api.post('/orders/order_deliveries/', {
        order: newId,
        delivery_service: row.delivery_service,
        tracking_number: row.tracking_number || '',
        delivery_date: row.delivery_date || null,
      });
      row.id = created.data.id;
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
        const toSend = isTerminal
          ? (payload.comment !== undefined ? { comment: payload.comment } : {})
          : payload;
        const hasDrafts = draftPayments.length > 0 || draftDeliveries.length > 0 || dirtyDeliveryIds.size > 0;
        if (Object.keys(toSend).length === 0 && !hasDrafts) {
          notify('Нет изменений для сохранения', 'warning');
          return;
        }
        if (Object.keys(toSend).length > 0) {
          await api.patch(`/orders/orders/${id}/`, toSend);
        }
        // Persist draft payments
        for (const dp of draftPayments) {
          await api.post('/orders/order_payments/', {
            order: id,
            payment_type: dp.payment_type,
            amount: dp.amount,
          });
        }
        // Persist new draft deliveries
        for (const row of draftDeliveries) {
          if (!row.delivery_service) continue;
          await api.post('/orders/order_deliveries/', {
            order: id,
            delivery_service: row.delivery_service,
            tracking_number: row.tracking_number || '',
            delivery_date: row.delivery_date || null,
          });
        }
        // Persist edited existing deliveries
        const currentDeliveries = order.deliveries || [];
        for (const dlv of currentDeliveries) {
          if (!dirtyDeliveryIds.has(dlv.id)) continue;
          await api.patch(`/orders/order_deliveries/${dlv.id}/`, {
            delivery_service: dlv.delivery_service,
            tracking_number: dlv.tracking_number || '',
            delivery_date: dlv.delivery_date || null,
          });
        }
        setDraftPayments([]);
        setDraftDeliveries([]);
        setDirtyDeliveryIds(new Set());
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
        'Удалить заказ? Остаток на складе не изменится.'
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

  const openClientPicker = () => {
    if (isTerminal) return;
    setOpenClientModal(true);
  };

  const selectClient = (client) => {
    handleChange('client', client.id);
    setSelectedClientName(`${client.first_name || ''} ${client.last_name || ''}`.trim());
    if (client.discount_percent != null) {
      handleChange('discount_percent', client.discount_percent);
    }
    setOpenClientModal(false);
  };

  const persistPhoneNumber = async (phoneId, number) => {
    if (!order?.client || isTerminal) return;
    const trimmed = number.trim();
    if (!trimmed) {
      notify('Введите номер телефона', 'warning');
      return;
    }
    setPhoneSaving(true);
    try {
      if (phoneId) {
        await api.patch(`/clients/client_phones/${phoneId}/`, { number: trimmed });
        setClientPhones((prev) => prev.map((row) => (
          row.id === phoneId ? { ...row, number: trimmed } : row
        )));
      } else {
        const res = await api.post('/clients/client_phones/', {
          client: currentClientId,
          number: trimmed,
          is_primary: clientPhones.length === 0,
        });
        setClientPhones((prev) => [...prev, res.data]);
        setDraftPhone(null);
      }
    } catch (err) {
      notify(`Не удалось сохранить телефон:\n${extractApiError(err)}`, 'error');
    } finally {
      setPhoneSaving(false);
    }
  };

  const handleAddPhone = () => {
    if (isTerminal) return;
    if (!order?.client) {
      notify('Сначала выберите клиента', 'warning');
      openClientPicker();
      return;
    }
    if (clientPhones.length === 0 || draftPhone !== null) return;
    setDraftPhone('');
  };

  const addDeliveryRow = () => {
    setDraftDeliveries((prev) => [
      ...prev,
      { tempId: `draft-${Date.now()}`, delivery_service: '', tracking_number: '', delivery_date: '' },
    ]);
  };


  const updateDraftDelivery = (tempId, field, value) => {
    setDraftDeliveries((prev) => prev.map((row) => (
      row.tempId === tempId ? { ...row, [field]: value } : row
    )));
  };

  const markDeliveryDirty = (deliveryId) => {
    if (deliveryId) setDirtyDeliveryIds((prev) => new Set(prev).add(deliveryId));
  };

  const handleDeliveryServiceChange = (row, value) => {
    if (row.tempId) {
      updateDraftDelivery(row.tempId, 'delivery_service', value);
      return;
    }
    setOrder((prev) => ({
      ...prev,
      deliveries: (prev.deliveries || []).map((d) =>
        d.id === row.id ? { ...d, delivery_service: value } : d
      ),
    }));
    markDeliveryDirty(row.id);
  };

  const handleDeliveryTrackingBlur = (row, value) => {
    const tracking = value.trim();
    if (row.tempId) {
      updateDraftDelivery(row.tempId, 'tracking_number', tracking);
      return;
    }
    if (tracking === (row.tracking_number || '')) return;
    setOrder((prev) => ({
      ...prev,
      deliveries: (prev.deliveries || []).map((d) =>
        d.id === row.id ? { ...d, tracking_number: tracking } : d
      ),
    }));
    markDeliveryDirty(row.id);
  };

  const handleDeliveryDateBlur = (row, value) => {
    const deliveryDate = value || null;
    if (row.tempId) {
      updateDraftDelivery(row.tempId, 'delivery_date', deliveryDate || '');
      return;
    }
    if ((row.delivery_date || null) === deliveryDate) return;
    setOrder((prev) => ({
      ...prev,
      deliveries: (prev.deliveries || []).map((d) =>
        d.id === row.id ? { ...d, delivery_date: deliveryDate } : d
      ),
    }));
    markDeliveryDirty(row.id);
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

  const handleAddPayment = () => {
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
    setDraftPayments((prev) => [
      ...prev,
      { tempId: `draft-${Date.now()}`, payment_type: paymentType, amount },
    ]);
    setPaymentType('');
    setPaymentAmount('');
  };

  const handleDeletePayment = async (payment) => {
    if (isTerminal) return;
    if (!(await confirm('Удалить оплату?'))) return;
    if (payment.tempId) {
      setDraftPayments((prev) => prev.filter((p) => p.tempId !== payment.tempId));
      return;
    }
    setPaymentSaving(true);
    try {
      await api.delete(`/orders/order_payments/${payment.id}/`);
      await refreshOrder();
    } catch (err) {
      notify(`Ошибка удаления оплаты:\n${extractApiError(err)}`, 'error');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleOpenProductSearch = async () => {
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
  };

  const closeGrillClientModal = () => {
    if (grillSaving) return;
    setOpenGrillClientModal(false);
    setPendingGrillProducts([]);
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
  const allPayments = [...payments, ...draftPayments];
  const paidTotal = allPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const subtotal = (order.items || []).reduce((sum, item) => sum + parseFloat(item.line_total || 0), 0);
  const discountPct = parseFloat(order.discount_percent || 0);
  const orderTotal = subtotal * (1 - discountPct / 100);
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
          <OrderDataTab
            isNew={isNew}
            isTerminal={isTerminal}
            order={order}
            channels={channels}
            sellers={sellers}
            isManager={isManager}
            saving={saving}
            orderStatuses={orderStatuses}
            mutatingDeliveries={mutatingDeliveries}
            deliveryRows={deliveryRows}
            deliveryServices={deliveryServices}
            clientDisplayName={clientDisplayName}
            clientPhones={clientPhones}
            phoneSaving={phoneSaving}
            draftPhone={draftPhone}
            onChange={handleChange}
            onStatusChange={handleStatusChange}
            onAddDelivery={addDeliveryRow}
            onDeliveryServiceChange={handleDeliveryServiceChange}
            onDeliveryTrackingBlur={handleDeliveryTrackingBlur}
            onDeliveryDateBlur={handleDeliveryDateBlur}
            onDeleteDelivery={handleDeleteDelivery}
            onAddPhone={handleAddPhone}
            onOpenClientPicker={openClientPicker}
            onPersistPhone={persistPhoneNumber}
            onDraftPhoneChange={setDraftPhone}
          />
        )}

        {tab === 1 && (
          <OrderItemsTab
            isNew={isNew}
            isTerminal={isTerminal}
            mutatingItems={mutatingItems}
            saving={saving}
            order={order}
            paymentSaving={paymentSaving}
            paymentType={paymentType}
            paymentTypes={paymentTypes}
            paymentAmount={paymentAmount}
            payments={allPayments}
            paymentTypeName={paymentTypeName}
            orderTotal={orderTotal}
            paidTotal={paidTotal}
            remaining={remaining}
            onAddProduct={handleOpenProductSearch}
            onQtyChange={handleQtyChange}
            onDeleteItem={handleDeleteItem}
            onAddPayment={handleAddPayment}
            onDeletePayment={handleDeletePayment}
            onPaymentTypeChange={setPaymentType}
            onPaymentAmountChange={setPaymentAmount}
          />
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

      <ClientPickerDialog
        open={openClientModal}
        onClose={() => setOpenClientModal(false)}
        onSelect={selectClient}
      />

      <GrillClientDialog
        open={openGrillClientModal}
        form={grillForm}
        saving={grillSaving}
        onChange={setGrillForm}
        onClose={closeGrillClientModal}
        onSubmit={submitGrillClient}
      />
    </Box>
  );
};

export default OrderDetail;
