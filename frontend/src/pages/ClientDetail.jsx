import {
  Box, Typography, Paper, TextField, Button, Grid, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, Select, MenuItem, Avatar, Chip,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { extractApiError, formatCurrency } from '../utils';
import { useFeedback } from '../components/FeedbackProvider';

const GRILL_TYPES = [
  { value: 'charcoal', label: 'Угольный' },
  { value: 'gas', label: 'Газовый' },
  { value: 'ceramic', label: 'Керамический' },
];

const CLIENT_WRITABLE = [
  'first_name',
  'last_name',
  'middle_name',
  'email',
  'birth_date',
  'address',
  'grill_type',
  'discount_percent',
  'preferred_contact',
  'acquisition_source',
  'comment',
];

const ClientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useFeedback();
  const [client, setClient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [channels, setChannels] = useState([]);
  const [phones, setPhones] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [newPhone, setNewPhone] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);

  const isNew = id === 'new';

  const loadPhones = async (clientId) => {
    try {
      const res = await api.get('/clients/client_phones/', { params: { client: clientId } });
      setPhones(res.data.results || res.data || []);
    } catch (err) {
      console.error('Failed to load phones', err);
      setPhones([]);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const channelsRes = await api.get('/orders/sales_channels/').catch(() => ({ data: [] }));
        setChannels(channelsRes.data.results || channelsRes.data || []);

        if (!isNew) {
          const [clientRes, ordersRes] = await Promise.all([
            api.get(`/clients/clients/${id}/`),
            api.get(`/orders/orders/?client=${id}`).catch(() => ({ data: [] })),
          ]);
          setClient(clientRes.data);
          setFormData(clientRes.data);
          setOrders(ordersRes.data.results || ordersRes.data || []);
          await loadPhones(id);
        } else {
          setClient({});
          setFormData({ discount_percent: 0, grill_type: '' });
          setOrders([]);
          setPhones([]);
        }
      } catch (err) {
        console.error('Failed to load client details', err);
      } finally {
        if (isNew) setClient({});
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isNew]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const buildWritablePayload = () => {
    const payload = {};
    for (const field of CLIENT_WRITABLE) {
      if (formData[field] !== undefined && formData[field] !== '') {
        payload[field] = formData[field];
      }
    }
    if (formData.discount_percent !== undefined && formData.discount_percent !== '') {
      payload.discount_percent = formData.discount_percent;
    }
    return payload;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const payload = buildWritablePayload();
        if (formData.phone) {
          payload.phone = formData.phone;
        }
        if (!payload.first_name) {
          notify('Укажите имя клиента', 'warning');
          return;
        }
        const res = await api.post('/clients/clients/', payload);
        notify('Новый клиент создан', 'success');
        navigate(`/clients/${res.data.id}`);
      } else {
        const payload = buildWritablePayload();
        await api.patch(`/clients/clients/${id}/`, payload);
        notify('Клиент сохранен', 'success');
        const clientRes = await api.get(`/clients/clients/${id}/`);
        setClient(clientRes.data);
        setFormData(clientRes.data);
      }
    } catch (err) {
      console.error('Failed to save client', err);
      notify(`Ошибка при сохранении клиента:\n${extractApiError(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPhone = async () => {
    if (!newPhone.trim()) {
      notify('Введите номер телефона', 'warning');
      return;
    }
    setPhoneSaving(true);
    try {
      await api.post('/clients/client_phones/', {
        client: id,
        number: newPhone.trim(),
        is_primary: phones.length === 0,
      });
      setNewPhone('');
      await loadPhones(id);
    } catch (err) {
      notify(`Ошибка добавления телефона:\n${extractApiError(err)}`, 'error');
    } finally {
      setPhoneSaving(false);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh"
        }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!client) {
    return <Typography>Клиент не найден</Typography>;
  }

  const fullName =
    `${formData.first_name || ''} ${formData.last_name || ''}`.trim() || 'Новый клиент';

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', pb: 10 }}>
      <Paper sx={{ p: 4, borderRadius: 4, backgroundColor: '#FFFFFF', boxShadow: 'none' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Button
            variant="contained"
            sx={{
              backgroundColor: '#CC5E33',
              '&:hover': { backgroundColor: '#A84C28' },
              borderRadius: 1,
              textTransform: 'uppercase',
              px: 3,
            }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <CircularProgress size={24} color="inherit" /> : 'СОХРАНИТЬ КЛИЕНТА'}
          </Button>
        </Box>

        <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 4, p: 4, mb: 4 }}>
          {!isNew && (
            <Typography variant="h4" sx={{ mb: 4, fontWeight: 500, color: '#1A202C' }}>
              {fullName}
            </Typography>
          )}

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Имя"
                name="first_name"
                value={formData.first_name || ''}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Фамилия"
                name="last_name"
                value={formData.last_name || ''}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Email"
                name="email"
                value={formData.email || ''}
                onChange={handleInputChange}
              />
            </Grid>
            {isNew && (
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Телефон"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleInputChange}
                  placeholder="+375..."
                />
              </Grid>
            )}
          </Grid>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  ml: 1,
                  mb: 0.5,
                  display: 'block'
                }}>
                Дата первого заказа
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="date"
                name="first_purchase_date"
                value={formData.first_purchase_date || ''}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  ml: 1,
                  mb: 0.5,
                  display: 'block'
                }}>
                Дата крайнего заказа
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="date"
                name="last_purchase_date"
                value={formData.last_purchase_date || ''}
                disabled
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  ml: 1,
                  mb: 0.5,
                  display: 'block'
                }}>
                Канал привлечения
              </Typography>
              <Select
                fullWidth
                size="small"
                displayEmpty
                name="acquisition_source"
                value={formData.acquisition_source || ''}
                onChange={handleInputChange}
                sx={{ color: formData.acquisition_source ? '#1A202C' : '#718096' }}
              >
                <MenuItem value="" disabled>
                  Не указан
                </MenuItem>
                {channels.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  ml: 1,
                  mb: 0.5,
                  display: 'block'
                }}>
                День рождения
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="date"
                name="birth_date"
                value={formData.birth_date || ''}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  ml: 1,
                  mb: 0.5,
                  display: 'block'
                }}>
                Скидка
              </Typography>
              <TextField
                fullWidth
                size="small"
                name="discount_percent"
                value={formData.discount_percent || 0}
                onChange={handleInputChange}
                slotProps={{
                  input: {
                    endAdornment: (
                      <Typography sx={{ color: '#718096', ml: 1 }}>%</Typography>
                    ),
                  },
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  ml: 1,
                  mb: 0.5,
                  display: 'block'
                }}>
                Тип гриля
              </Typography>
              <Select
                fullWidth
                size="small"
                displayEmpty
                name="grill_type"
                value={formData.grill_type || ''}
                onChange={handleInputChange}
              >
                <MenuItem value="">Не указан</MenuItem>
                {GRILL_TYPES.map((g) => (
                  <MenuItem key={g.value} value={g.value}>
                    {g.label}
                  </MenuItem>
                ))}
              </Select>
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  ml: 1,
                  mb: 0.5,
                  display: 'block'
                }}>
                Общий бюджет
              </Typography>
              <TextField
                fullWidth
                size="small"
                disabled
                value={
                  formData.total_budget != null && formData.total_budget !== ''
                    ? formatCurrency(formData.total_budget)
                    : formatCurrency(0)
                }
              />
            </Grid>
          </Grid>
        </Box>

        {/* Phones */}
        {!isNew && (
          <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 4, p: 4, mb: 4 }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 500, color: '#1A202C' }}>
              Телефоны
            </Typography>
            {phones.length > 0 ? (
              <TableContainer sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Номер</TableCell>
                      <TableCell>Комментарий</TableCell>
                      <TableCell>Основной</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {phones.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.number}</TableCell>
                        <TableCell>{p.comment || '—'}</TableCell>
                        <TableCell>{p.is_primary ? 'Да' : 'Нет'}</TableCell>
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
                Телефоны не добавлены
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', maxWidth: 480 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="+375..."
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
              <Button
                variant="outlined"
                disabled={phoneSaving}
                onClick={handleAddPhone}
                sx={{ whiteSpace: 'nowrap' }}
              >
                {phoneSaving ? <CircularProgress size={20} /> : 'Добавить'}
              </Button>
            </Box>
          </Box>
        )}

        <Box sx={{ mt: 6 }}>
          <Typography variant="h5" sx={{ mb: 4, fontWeight: 500, color: '#1A202C' }}>
            История заказов
          </Typography>

          <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 4, p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
              <Button
                variant="contained"
                sx={{
                  backgroundColor: '#CC5E33',
                  '&:hover': { backgroundColor: '#A84C28' },
                  boxShadow: 'none',
                }}
                disabled={isNew}
                onClick={() => navigate(`/orders/new?client=${id}`)}
              >
                НОВАЯ СДЕЛКА +
              </Button>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>№ Заказа</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Дата заказа</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Дата доставки</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Продавец</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Форма оплаты</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Канал продажи</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Скидка</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }}>Статус</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#4A5568' }} align="right">
                      Стоимость
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orders.map((row) => (
                    <TableRow
                      key={row.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/orders/${row.id}`)}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox size="small" />
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>#{row.order_number}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.order_date}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>
                        {row.completed_at ? row.completed_at.substring(0, 10) : ''}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar
                            sx={{
                              width: 24,
                              height: 24,
                              fontSize: 10,
                              bgcolor: '#CBD5E0',
                              color: '#1A202C',
                            }}
                          >
                            {row.seller_name
                              ? row.seller_name.substring(0, 2).toUpperCase()
                              : 'ВА'}
                          </Avatar>
                          <Typography variant="body2">
                            {row.seller_name || 'Неизвестно'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>
                        {row.payment_type_name || '—'}
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.sales_channel_name}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{row.discount_percent}%</TableCell>
                      <TableCell>
                        <Chip
                          label={row.status_display || row.status}
                          size="small"
                          variant="outlined"
                          sx={{
                            color: '#DD6B20',
                            borderColor: '#DD6B20',
                            height: 24,
                            fontSize: '0.75rem',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ color: '#4A5568', fontWeight: 500 }}>
                        {row.total} BYN
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 3, color: '#718096' }}>
                        Нет заказов для данного клиента
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default ClientDetail;
