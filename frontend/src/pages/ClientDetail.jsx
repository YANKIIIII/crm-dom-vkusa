import {
  Autocomplete,
  Box, Typography, Paper, TextField, Button, Grid, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Avatar, Chip, Checkbox, IconButton, Tooltip,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { extractApiError, formatCurrency, formatDate, CATALOG_PAGE_SIZE, unwrapList, mapGrillTypes } from '../utils';
import { useFeedback } from '../hooks/useFeedback';
import SearchableSelect from '../components/SearchableSelect';

const PHONE_COMMENT_OPTIONS = ['рабочий', 'домашний', 'мобильный', 'WhatsApp', 'Telegram', 'Viber'];

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

const dateFieldSx = {
  '& input::-webkit-calendar-picker-indicator': { cursor: 'pointer', opacity: 1 },
};

const fieldSize = { xs: 12, md: 4 };

const resolveAcquisition = (value, channelList) => {
  const raw = value || '';
  if (!raw) return '';
  const byName = channelList.find((c) => c.name === raw);
  if (byName) return byName.name;
  const byId = channelList.find((c) => String(c.id) === String(raw));
  return byId ? byId.name : raw;
};

const PhoneCommentField = ({
  id,
  value,
  onCommit,
  disabled = false,
  placeholder = 'Например: рабочий',
  label,
}) => {
  const [draft, setDraft] = useState(value || '');

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const commit = (next) => {
    const normalized = next ?? '';
    setDraft(normalized);
    if (normalized !== (value || '')) {
      onCommit(normalized);
    }
  };

  return (
    <Autocomplete
      id={id}
      freeSolo
      fullWidth
      size="small"
      disabled={disabled}
      options={PHONE_COMMENT_OPTIONS}
      value={draft}
      onChange={(_event, next) => commit(typeof next === 'string' ? next : next || '')}
      onInputChange={(_event, next, reason) => {
        if (reason === 'input') setDraft(next);
      }}
      onBlur={() => commit(draft)}
      slotProps={{ popper: { sx: { zIndex: 2000 } } }}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={placeholder} />
      )}
    />
  );
};

const ClientDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify, confirm } = useFeedback();
  const [client, setClient] = useState(null);
  const [orders, setOrders] = useState([]);
  const [channels, setChannels] = useState([]);
  const [grillTypes, setGrillTypes] = useState([]);
  const [phones, setPhones] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const [newPhone, setNewPhone] = useState({ number: '', comment: '', is_primary: false });
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneBusyId, setPhoneBusyId] = useState(null);

  const isNew = id === 'new';

  const loadPhones = useCallback(async (clientId) => {
    try {
      const res = await api.get('/clients/client_phones/', { params: { client: clientId } });
      setPhones(res.data.results || res.data || []);
    } catch (err) {
      notify(`Не удалось загрузить телефоны:\n${extractApiError(err)}`, 'error');
      setPhones([]);
    }
  }, [notify]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [channelsRes, grillTypesRes] = await Promise.all([
          api.get('/orders/sales_channels/', { params: { page_size: CATALOG_PAGE_SIZE } }).catch(() => ({ data: [] })),
          api.get('/catalog/grill_types/', { params: { page_size: CATALOG_PAGE_SIZE } }).catch(() => ({ data: [] })),
        ]);
        const channelList = unwrapList(channelsRes.data);
        setChannels(channelList);
        setGrillTypes(mapGrillTypes(unwrapList(grillTypesRes.data)));

        if (!isNew) {
          const [clientRes, ordersRes] = await Promise.all([
            api.get(`/clients/clients/${id}/`),
            api.get(`/orders/orders/?client=${id}`).catch(() => ({ data: [] })),
          ]);
          const loaded = clientRes.data;
          setClient(loaded);
          setFormData({
            ...loaded,
            acquisition_source: resolveAcquisition(loaded.acquisition_source, channelList),
          });
          setOrders(ordersRes.data.results || ordersRes.data || []);
          await loadPhones(id);
        } else {
          setClient({});
          setFormData({ discount_percent: 0, grill_type: '', phone: '', phone_comment: '' });
          setOrders([]);
          setPhones([]);
        }
      } catch (err) {
        notify(`Не удалось загрузить клиента:\n${extractApiError(err)}`, 'error');
      } finally {
        if (isNew) setClient({});
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isNew, notify, loadPhones]);

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
          payload.phone_comment = formData.phone_comment || '';
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
        setFormData({
          ...clientRes.data,
          acquisition_source: resolveAcquisition(clientRes.data.acquisition_source, channels),
        });
      }
    } catch (err) {
      notify(`Ошибка при сохранении клиента:\n${extractApiError(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const persistPhone = async (phone, patch) => {
    setPhoneBusyId(phone.id);
    try {
      await api.patch(`/clients/client_phones/${phone.id}/`, patch);
      await loadPhones(id);
    } catch (err) {
      notify(`Не удалось сохранить телефон:\n${extractApiError(err)}`, 'error');
      await loadPhones(id);
    } finally {
      setPhoneBusyId(null);
    }
  };

  const handleAddPhone = async () => {
    if (!newPhone.number.trim()) {
      notify('Введите номер телефона', 'warning');
      return;
    }
    setPhoneSaving(true);
    try {
      await api.post('/clients/client_phones/', {
        client: id,
        number: newPhone.number.trim(),
        comment: newPhone.comment.trim(),
        is_primary: phones.length === 0 ? true : newPhone.is_primary,
      });
      setNewPhone({ number: '', comment: '', is_primary: false });
      await loadPhones(id);
    } catch (err) {
      notify(`Ошибка добавления телефона:\n${extractApiError(err)}`, 'error');
    } finally {
      setPhoneSaving(false);
    }
  };

  const handleDeletePhone = async (phone) => {
    if (!(await confirm(`Удалить номер ${phone.number}?`))) return;
    setPhoneBusyId(phone.id);
    try {
      await api.delete(`/clients/client_phones/${phone.id}/`);
      await loadPhones(id);
    } catch (err) {
      notify(`Не удалось удалить телефон:\n${extractApiError(err)}`, 'error');
    } finally {
      setPhoneBusyId(null);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '50vh',
        }}
      >
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

          <Grid container spacing={2.5}>
            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                label="Имя"
                name="first_name"
                value={formData.first_name || ''}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                label="Фамилия"
                name="last_name"
                value={formData.last_name || ''}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid size={fieldSize}>
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
              <>
                <Grid size={fieldSize}>
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
                <Grid size={fieldSize}>
                  <PhoneCommentField
                    id="new-client-phone-comment"
                    label="Комментарий к номеру"
                    value={formData.phone_comment || ''}
                    onCommit={(comment) => setFormData((prev) => ({ ...prev, phone_comment: comment }))}
                    placeholder="рабочий, WhatsApp…"
                  />
                </Grid>
              </>
            )}

            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Дата первого заказа"
                name="first_purchase_date"
                value={formData.first_purchase_date || ''}
                disabled
                sx={dateFieldSx}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Дата крайнего заказа"
                name="last_purchase_date"
                value={formData.last_purchase_date || ''}
                disabled
                sx={dateFieldSx}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={fieldSize}>
              <Box sx={{ width: '100%' }}>
                <SearchableSelect
                  id="client-acquisition-source"
                  label="Канал привлечения"
                  value={formData.acquisition_source || ''}
                  onChange={(value) => setFormData((prev) => ({ ...prev, acquisition_source: value }))}
                  options={[
                    { value: '', label: 'Не указан' },
                    ...channels.map((c) => ({ value: c.name, label: c.name })),
                  ]}
                />
              </Box>
            </Grid>

            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="День рождения"
                name="birth_date"
                value={formData.birth_date || ''}
                onChange={handleInputChange}
                sx={dateFieldSx}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                label="Скидка"
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
            <Grid size={fieldSize}>
              <Box sx={{ width: '100%' }}>
                <SearchableSelect
                  id="client-grill-type"
                  label="Тип гриля"
                  value={formData.grill_type || ''}
                  onChange={(value) => setFormData((prev) => ({ ...prev, grill_type: value }))}
                  options={[
                    { value: '', label: 'Не указан' },
                    ...grillTypes,
                  ]}
                />
              </Box>
            </Grid>

            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                label="Общий бюджет"
                disabled
                value={
                  formData.total_budget != null && formData.total_budget !== ''
                    ? formatCurrency(formData.total_budget)
                    : formatCurrency(0)
                }
              />
            </Grid>
            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                label="Адрес"
                name="address"
                value={formData.address || ''}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid size={fieldSize}>
              <TextField
                fullWidth
                size="small"
                label="Комментарий"
                name="comment"
                value={formData.comment || ''}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
        </Box>

        {!isNew && (
          <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 4, p: 4, mb: 4 }}>
            <Typography variant="h5" sx={{ mb: 3, fontWeight: 500, color: '#1A202C' }}>
              Телефоны
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '34%' }}>Номер</TableCell>
                    <TableCell sx={{ width: '34%' }}>Комментарий</TableCell>
                    <TableCell sx={{ width: '16%' }}>Основной</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {phones.map((phone) => {
                    const busy = phoneBusyId === phone.id;
                    return (
                      <TableRow key={phone.id}>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            disabled={busy}
                            defaultValue={phone.number}
                            key={`${phone.id}-${phone.number}`}
                            placeholder="+375..."
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              if (!next || next === phone.number) return;
                              persistPhone(phone, { number: next });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <PhoneCommentField
                            id={`phone-comment-${phone.id}`}
                            value={phone.comment || ''}
                            disabled={busy}
                            onCommit={(comment) => {
                              if (comment === (phone.comment || '')) return;
                              persistPhone(phone, { comment });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={Boolean(phone.is_primary)}
                            disabled={busy || phone.is_primary}
                            onChange={() => persistPhone(phone, { is_primary: true })}
                            slotProps={{ input: { 'aria-label': `Основной номер ${phone.number}` } }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Удалить номер">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={busy}
                                aria-label={`Удалить номер ${phone.number}`}
                                onClick={() => handleDeletePhone(phone)}
                              >
                                <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">
                                  delete
                                </span>
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        placeholder="+375..."
                        value={newPhone.number}
                        onChange={(e) => setNewPhone((prev) => ({ ...prev, number: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddPhone();
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <PhoneCommentField
                        id="new-phone-comment"
                        value={newPhone.comment}
                        onCommit={(comment) => setNewPhone((prev) => ({ ...prev, comment }))}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={phones.length === 0 ? true : newPhone.is_primary}
                        disabled={phones.length === 0}
                        onChange={(e) => setNewPhone((prev) => ({ ...prev, is_primary: e.target.checked }))}
                        slotProps={{ input: { 'aria-label': 'Сделать основным' } }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        variant="outlined"
                        disabled={phoneSaving}
                        onClick={handleAddPhone}
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        {phoneSaving ? <CircularProgress size={20} /> : 'Добавить'}
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
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
                      <TableCell sx={{ color: '#4A5568' }} onClick={(e) => e.stopPropagation()}>
                        <Box
                          component={RouterLink}
                          to={`/orders/${row.id}`}
                          aria-label={`Открыть заказ ${row.order_number}`}
                          sx={{
                            color: 'inherit',
                            textDecoration: 'none',
                            fontWeight: 500,
                            '&:hover': { textDecoration: 'underline' },
                          }}
                        >
                          #{row.order_number}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>{formatDate(row.order_date) || '—'}</TableCell>
                      <TableCell sx={{ color: '#4A5568' }}>
                        {formatDate(row.completed_at) || '—'}
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
                        {formatCurrency(row.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 3, color: '#718096' }}>
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
