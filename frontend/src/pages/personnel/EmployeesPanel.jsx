import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, List, ListItemButton, ListItemAvatar, ListItemText,
  Paper, TextField, Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../api';
import { useFeedback } from '../../hooks/useFeedback';
import { extractApiError, formatCurrency, unwrapList } from '../../utils';
import LeaveDialog from './LeaveDialog';

const ROLE_LABELS = {
  seller: 'Сотрудник',
  manager: 'Руководитель',
};

const KIND_LABELS = {
  vacation: 'Отпуск',
  time_off: 'Отгул',
};

const pad2 = (value) => String(value).padStart(2, '0');

const employeeName = (row) => (
  `${row.last_name || ''} ${row.first_name || ''}`.trim() || row.username || `Сотрудник #${row.id}`
);

const employeeInitials = (row) => {
  const last = (row.last_name || '')[0] || '';
  const first = (row.first_name || '')[0] || '';
  return (last + first).toUpperCase() || (row.username || '?')[0].toUpperCase();
};

const formatIso = (iso) => {
  if (!iso) return '';
  const [year, month, day] = String(iso).split('-');
  if (!year || !month || !day) return String(iso);
  return `${day}.${month}.${year}`;
};

const formatIsoRange = (from, to) => {
  if (!from) return '';
  if (!to || to === from) return formatIso(from);
  return `${formatIso(from)}–${formatIso(to)}`;
};

const pluralizeDays = (n) => {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} день`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} дня`;
  return `${n} дней`;
};

const emptyProfile = {
  phone: '',
  birthday: '',
  notes: '',
  hourly_rate: '',
  commission_percent: '',
};

const emptyMonth = { hours: '', bonus: '' };

const profilesEqual = (a, b) => (
  (a.phone || '') === (b.phone || '')
  && (a.birthday || '') === (b.birthday || '')
  && (a.notes || '') === (b.notes || '')
  && Number(a.hourly_rate || 0) === Number(b.hourly_rate || 0)
  && Number(a.commission_percent || 0) === Number(b.commission_percent || 0)
);

const monthsEqual = (a, b) => (
  Number(a.hours || 0) === Number(b.hours || 0)
  && Number(a.bonus || 0) === Number(b.bonus || 0)
);

const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const SectionTitle = ({ icon, children }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
    <span className="material-icons" style={{ fontSize: 18, color: '#CC5E33' }} aria-hidden="true">{icon}</span>
    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#2D3748', fontSize: '0.85rem' }}>{children}</Typography>
  </Box>
);

const EmployeesPanel = ({ year, month }) => {
  const { notify } = useFeedback();
  const [employees, setEmployees] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [profile, setProfile] = useState(emptyProfile);
  const [savedProfile, setSavedProfile] = useState(emptyProfile);
  const [monthForm, setMonthForm] = useState(emptyMonth);
  const [savedMonth, setSavedMonth] = useState(emptyMonth);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);
  const [leavePreset, setLeavePreset] = useState(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const refreshList = useCallback(() => (
    api.get('/personnel/employees/', { params: { year, month } })
      .then((res) => setEmployees(unwrapList(res.data)))
      .catch((err) => notify(`Не удалось обновить список:\n${extractApiError(err)}`, 'error'))
  ), [year, month, notify]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    api.get('/personnel/employees/', { params: { year, month } })
      .then((res) => {
        if (cancelled) return;
        const rows = unwrapList(res.data);
        setEmployees(rows);
        setListError(null);
        setSelectedId((current) => {
          if (current && rows.some((row) => row.id === current)) return current;
          return rows[0]?.id ?? null;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setListError(extractApiError(err));
        notify(`Не удалось загрузить сотрудников:\n${extractApiError(err)}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, version, notify]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setProfile(emptyProfile);
      setSavedProfile(emptyProfile);
      setMonthForm(emptyMonth);
      setSavedMonth(emptyMonth);
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    api.get(`/personnel/employees/${selectedId}/`, { params: { year, month } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        setDetail(data);
        const nextProfile = {
          phone: data.phone || '',
          birthday: data.birthday ? String(data.birthday).slice(0, 10) : '',
          notes: data.notes || '',
          hourly_rate: data.hourly_rate ?? '',
          commission_percent: data.commission_percent ?? '',
        };
        const nextMonth = {
          hours: data.month?.hours ?? '',
          bonus: data.month?.bonus ?? '',
        };
        setProfile(nextProfile);
        setSavedProfile(nextProfile);
        setMonthForm(nextMonth);
        setSavedMonth(nextMonth);
      })
      .catch((err) => {
        if (cancelled) return;
        setDetail(null);
        notify(`Не удалось загрузить карточку:\n${extractApiError(err)}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, year, month, version, notify]);

  const profileDirty = useMemo(() => !profilesEqual(profile, savedProfile), [profile, savedProfile]);
  const monthDirty = useMemo(() => !monthsEqual(monthForm, savedMonth), [monthForm, savedMonth]);

  const saveProfile = async (employeeId, draft) => {
    if (toNum(draft.hourly_rate) < 0 || toNum(draft.commission_percent) < 0) {
      notify('Ставка и процент не могут быть отрицательными.', 'error');
      return false;
    }
    if (toNum(draft.commission_percent) > 100) {
      notify('Процент с продаж должен быть от 0 до 100.', 'error');
      return false;
    }
    const payload = {
      phone: draft.phone || '',
      birthday: draft.birthday || null,
      notes: draft.notes || '',
      hourly_rate: draft.hourly_rate === '' ? '0' : draft.hourly_rate,
      commission_percent: draft.commission_percent === '' ? '0' : draft.commission_percent,
    };
    await api.patch(`/personnel/employees/${employeeId}/`, payload);
    if (selectedIdRef.current === employeeId) {
      const next = {
        phone: payload.phone,
        birthday: payload.birthday || '',
        notes: payload.notes,
        hourly_rate: payload.hourly_rate,
        commission_percent: payload.commission_percent,
      };
      setProfile(next);
      setSavedProfile(next);
    }
    return true;
  };

  const saveMonth = async (employeeId, draft) => {
    if (toNum(draft.hours) < 0 || toNum(draft.bonus) < 0) {
      notify('Часы и бонус не могут быть отрицательными.', 'error');
      return false;
    }
    const res = await api.put(
      `/personnel/employees/${employeeId}/months/${year}-${pad2(month)}/`,
      {
        hours: draft.hours === '' ? '0' : draft.hours,
        bonus: draft.bonus === '' ? '0' : draft.bonus,
      },
    );
    if (selectedIdRef.current === employeeId) {
      const next = { hours: res.data.hours ?? draft.hours, bonus: res.data.bonus ?? draft.bonus };
      setMonthForm(next);
      setSavedMonth(next);
      setDetail((prev) => (prev ? { ...prev, month: { ...prev.month, ...res.data } } : prev));
    }
    return true;
  };

  const persist = async (which, { toast = false } = {}) => {
    if (saving) return;
    const employeeId = selectedId;
    const doProfile = which !== 'month' && profileDirty;
    const doMonth = which !== 'profile' && monthDirty;
    if (!employeeId || (!doProfile && !doMonth)) return;
    setSaving(true);
    try {
      if (doProfile) {
        const ok = await saveProfile(employeeId, profile);
        if (!ok) return;
      }
      if (doMonth) {
        const ok = await saveMonth(employeeId, monthForm);
        if (!ok) return;
      }
      await refreshList();
      if (toast) notify('Сохранено', 'success');
    } catch (err) {
      notify(`Не удалось сохранить:\n${extractApiError(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openLeave = (kind, leave = null) => {
    setEditingLeave(leave);
    setLeavePreset(leave ? null : { user: selectedId, kind, date_from: '', date_to: '' });
    setLeaveOpen(true);
  };

  const monthInfo = detail?.month;
  const rateSource = monthInfo?.rate_source;
  const rate = rateSource === 'month' ? toNum(monthInfo?.hourly_rate) : toNum(profile.hourly_rate);
  const percent = rateSource === 'month' ? toNum(monthInfo?.commission_percent) : toNum(profile.commission_percent);
  const hours = toNum(monthForm.hours);
  const bonus = toNum(monthForm.bonus);
  const sales = toNum(monthInfo?.sales_total);
  const hoursPay = hours * rate;
  const salesPay = (percent / 100) * sales;
  const livePay = Number((hoursPay + salesPay + bonus).toFixed(2));
  const selected = employees.find((row) => row.id === selectedId) || detail;
  const roleOrTitle = selected?.job_title || ROLE_LABELS[selected?.role] || selected?.role || '';

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2.5,
        alignItems: 'stretch',
        flexDirection: { xs: 'column', md: 'row' },
      }}
    >
      {/* LEFT SIDEBAR: employee list */}
      <Paper
        sx={{
          width: { xs: '100%', md: 300 },
          flexShrink: 0,
          p: 0,
          maxHeight: { xs: 300, md: 'calc(100vh - 260px)' },
          overflow: 'auto',
          borderRadius: 3,
        }}
      >
        {listLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : listError ? (
          <Alert severity="error" sx={{ m: 1 }}>{listError}</Alert>
        ) : employees.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <span className="material-icons" style={{ fontSize: 48, color: '#CBD5E0' }} aria-hidden="true">group_add</span>
            <Typography sx={{ color: '#718096', mt: 1 }}>
              Сотрудников заводят в разделе Пользователи
            </Typography>
          </Box>
        ) : (
          <List disablePadding sx={{ p: 1 }}>
            {employees.map((row) => (
              <ListItemButton
                key={row.id}
                selected={row.id === selectedId}
                onClick={() => setSelectedId(row.id)}
                sx={{
                  opacity: row.is_active ? 1 : 0.45,
                  borderRadius: '10px',
                  mb: 0.5,
                  py: 1,
                  transition: 'all 0.15s',
                  '&.Mui-selected': {
                    bgcolor: 'rgba(204, 94, 51, 0.10)',
                    '&:hover': { bgcolor: 'rgba(204, 94, 51, 0.16)' },
                  },
                }}
              >
                <ListItemAvatar sx={{ minWidth: 40 }}>
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      bgcolor: row.id === selectedId ? '#CC5E33' : '#A0AEC0',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    {employeeInitials(row)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={employeeName(row)}
                  secondary={formatCurrency(row.pay_total ?? 0)}
                  slotProps={{
                    primary: { sx: { fontWeight: 600, color: '#1A202C', fontSize: '0.875rem' } },
                    secondary: { sx: { color: '#CC5E33', fontWeight: 700, fontSize: '0.8rem' } },
                  }}
                />
                {!row.is_active && (
                  <Chip size="small" label="Неактивен" sx={{ ml: 0.5, fontSize: '0.65rem', height: 20 }} />
                )}
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>

      {/* RIGHT PANEL: employee card */}
      <Paper
        sx={{
          flex: 1,
          p: 0,
          minHeight: 400,
          opacity: selected && selected.is_active === false ? 0.85 : 1,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        {!selectedId ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 8 }}>
            <span className="material-icons" style={{ fontSize: 56, color: '#CBD5E0' }} aria-hidden="true">person_search</span>
            <Typography sx={{ color: '#718096', mt: 1.5 }}>
              Выберите сотрудника из списка
            </Typography>
          </Box>
        ) : detailLoading && !detail ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
        ) : !detail ? (
          <Typography sx={{ color: '#718096', p: 3 }}>Не удалось загрузить карточку</Typography>
        ) : (
          <Box>
            {/* Header with avatar */}
            <Box
              sx={{
                background: 'linear-gradient(135deg, #2D3748 0%, #4A5568 100%)',
                px: 3,
                py: 2.5,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <Avatar
                sx={{
                  width: 48,
                  height: 48,
                  bgcolor: '#CC5E33',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                }}
              >
                {employeeInitials(detail)}
              </Avatar>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                    {employeeName(detail)}
                  </Typography>
                  {detail.is_active === false && (
                    <Chip
                      size="small"
                      label="Неактивен"
                      sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#FFFFFF', fontSize: '0.7rem' }}
                    />
                  )}
                </Box>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                  {roleOrTitle}
                  {detail.username ? ` · @${detail.username}` : ''}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* SECTION: Personal info */}
              <Box>
                <SectionTitle icon="badge">Личные данные</SectionTitle>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField
                    label="Телефон"
                    size="small"
                    value={profile.phone}
                    onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
                    onBlur={() => persist('profile')}
                    slotProps={{ input: { startAdornment: <span className="material-icons" style={{ fontSize: 18, color: '#A0AEC0', marginRight: 6 }} aria-hidden="true">phone</span> } }}
                  />
                  <TextField
                    label="День рождения"
                    size="small"
                    type="date"
                    value={profile.birthday}
                    onChange={(event) => setProfile((prev) => ({ ...prev, birthday: event.target.value }))}
                    onBlur={() => persist('profile')}
                    slotProps={{ inputLabel: { shrink: true }, input: { startAdornment: <span className="material-icons" style={{ fontSize: 18, color: '#A0AEC0', marginRight: 6 }} aria-hidden="true">cake</span> } }}
                  />
                </Box>
                <TextField
                  label="Заметка"
                  size="small"
                  value={profile.notes}
                  onChange={(event) => setProfile((prev) => ({ ...prev, notes: event.target.value }))}
                  onBlur={() => persist('profile')}
                  multiline
                  minRows={2}
                  fullWidth
                  sx={{ mt: 2 }}
                />
              </Box>

              <Divider />

              {/* SECTION: Rates */}
              <Box>
                <SectionTitle icon="payments">Ставки</SectionTitle>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <TextField
                    label="Ставка часа"
                    size="small"
                    type="number"
                    value={profile.hourly_rate}
                    onChange={(event) => setProfile((prev) => ({ ...prev, hourly_rate: event.target.value }))}
                    onBlur={() => persist('profile')}
                    slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                  />
                  <TextField
                    label="Процент с продаж"
                    size="small"
                    type="number"
                    value={profile.commission_percent}
                    onChange={(event) => setProfile((prev) => ({ ...prev, commission_percent: event.target.value }))}
                    onBlur={() => persist('profile')}
                    slotProps={{ htmlInput: { min: 0, max: 100, step: '0.01' } }}
                  />
                </Box>
                <Typography variant="caption" sx={{ color: '#A0AEC0', mt: 1, display: 'block' }}>
                  {rateSource === 'month'
                    ? `Для этого месяца зафиксированы: ${formatCurrency(monthInfo.hourly_rate)} / час, ${toNum(monthInfo.commission_percent)}%`
                    : 'Месяц ещё не сохраняли — расчёт по ставкам из профиля'}
                </Typography>
              </Box>

              <Divider />

              {/* SECTION: Month payroll */}
              <Box>
                <SectionTitle icon="calendar_month">Зарплата за месяц</SectionTitle>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
                  <TextField
                    label="Часы"
                    size="small"
                    type="number"
                    value={monthForm.hours}
                    onChange={(event) => setMonthForm((prev) => ({ ...prev, hours: event.target.value }))}
                    onBlur={() => persist('month')}
                    slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                  />
                  <TextField
                    label="Бонус"
                    size="small"
                    type="number"
                    value={monthForm.bonus}
                    onChange={(event) => setMonthForm((prev) => ({ ...prev, bonus: event.target.value }))}
                    onBlur={() => persist('month')}
                    slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                  />
                </Box>

                {/* Pay formula breakdown */}
                <Box
                  sx={{
                    bgcolor: '#F7FAFC',
                    borderRadius: 2.5,
                    p: 2,
                    border: '1px solid #EDF2F7',
                  }}
                >
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ color: '#4A5568' }}>
                        <span style={{ color: '#A0AEC0' }}>Часы:</span> {hours} ч × {formatCurrency(rate)}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#2D3748' }}>
                        {formatCurrency(hoursPay)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ color: '#4A5568' }}>
                        <span style={{ color: '#A0AEC0' }}>Продажи:</span> {percent}% от {formatCurrency(sales)}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#2D3748' }}>
                        {formatCurrency(salesPay)}
                      </Typography>
                    </Box>
                    {bonus > 0 && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" sx={{ color: '#4A5568' }}>
                          <span style={{ color: '#A0AEC0' }}>Бонус</span>
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2D3748' }}>
                          {formatCurrency(bonus)}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Divider sx={{ my: 1.5 }} />

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#1A202C' }}>
                      Итого
                    </Typography>
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 800,
                        color: '#CC5E33',
                        fontSize: '1.1rem',
                      }}
                    >
                      {formatCurrency(livePay)}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* Save button */}
              {(profileDirty || monthDirty) && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    onClick={() => persist('all', { toast: true })}
                    disabled={saving}
                    sx={{
                      borderRadius: '10px',
                      textTransform: 'none',
                      fontWeight: 600,
                      px: 4,
                    }}
                  >
                    {saving ? <CircularProgress size={22} /> : 'Сохранить'}
                  </Button>
                </Box>
              )}

              <Divider />

              {/* SECTION: Leaves */}
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <SectionTitle icon="beach_access">Отпуска / отгулы</SectionTitle>
                    {(() => {
                      const vacDays = (detail.leaves || [])
                        .filter((l) => l.kind === 'vacation')
                        .reduce((sum, l) => sum + (l.working_days || 0), 0);
                      const offDays = (detail.leaves || [])
                        .filter((l) => l.kind === 'time_off')
                        .reduce((sum, l) => sum + (l.working_days || 0), 0);
                      if (!vacDays && !offDays) return null;
                      return (
                        <Typography variant="caption" sx={{ color: '#718096', fontWeight: 600 }}>
                          {vacDays > 0 && `отпуск: ${pluralizeDays(vacDays)}`}
                          {vacDays > 0 && offDays > 0 && ' · '}
                          {offDays > 0 && `отгул: ${pluralizeDays(offDays)}`}
                        </Typography>
                      );
                    })()}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => openLeave('vacation')}
                      sx={{ textTransform: 'none', borderRadius: '8px', fontSize: '0.78rem' }}
                    >
                      + отпуск
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      onClick={() => openLeave('time_off')}
                      sx={{ textTransform: 'none', borderRadius: '8px', fontSize: '0.78rem' }}
                    >
                      + отгул
                    </Button>
                  </Box>
                </Box>
                {(detail.leaves || []).length === 0 ? (
                  <Typography variant="body2" sx={{ color: '#A0AEC0', mt: 0.5, fontStyle: 'italic' }}>
                    Нет отсутствий в этом месяце
                  </Typography>
                ) : (
                  <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    {(detail.leaves || []).map((item) => (
                      <Box
                        key={item.id}
                        component="button"
                        type="button"
                        onClick={() => openLeave(item.kind, item)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          width: '100%',
                          textAlign: 'left',
                          border: '1px solid #EDF2F7',
                          borderRadius: '8px',
                          bgcolor: '#FAFBFC',
                          cursor: 'pointer',
                          py: 1,
                          px: 1.5,
                          fontFamily: 'inherit',
                          transition: 'all 0.15s',
                          '&:hover': {
                            borderColor: '#CC5E33',
                            bgcolor: 'rgba(204, 94, 51, 0.04)',
                          },
                        }}
                      >
                        <Chip
                          size="small"
                          label={KIND_LABELS[item.kind] || item.kind}
                          sx={{
                            bgcolor: item.kind === 'vacation' ? '#90A4AE' : 'rgba(204, 94, 51, 0.35)',
                            color: item.kind === 'vacation' ? '#FFFFFF' : '#8B3A1D',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            height: 22,
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#2D3748' }}>
                          {formatIsoRange(item.date_from, item.date_to)}
                        </Typography>
                        {item.working_days > 0 && (
                          <Chip
                            size="small"
                            label={`${item.working_days} раб. дн.`}
                            sx={{ bgcolor: '#EDF2F7', color: '#4A5568', fontWeight: 600, fontSize: '0.65rem', height: 20 }}
                          />
                        )}
                        {item.comment && (
                          <Typography variant="caption" sx={{ color: '#A0AEC0', ml: 'auto' }}>{item.comment}</Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )}
      </Paper>

      <LeaveDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onSaved={bump}
        employees={employees}
        leave={editingLeave}
        preset={leavePreset}
      />
    </Box>
  );
};

export default EmployeesPanel;
