import {
  Alert, Box, Button, Chip, CircularProgress, List, ListItemButton, ListItemText,
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
        gap: 2,
        alignItems: 'stretch',
        flexDirection: { xs: 'column', md: 'row' },
      }}
    >
      <Paper
        sx={{
          width: { xs: '100%', md: 300 },
          flexShrink: 0,
          p: 1,
          maxHeight: { xs: 280, md: 'calc(100vh - 260px)' },
          overflow: 'auto',
        }}
      >
        {listLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : listError ? (
          <Alert severity="error">{listError}</Alert>
        ) : employees.length === 0 ? (
          <Typography sx={{ color: '#718096', p: 2 }}>
            Сотрудников заводят в разделе Пользователи
          </Typography>
        ) : (
          <List disablePadding>
            {employees.map((row) => (
              <ListItemButton
                key={row.id}
                selected={row.id === selectedId}
                onClick={() => setSelectedId(row.id)}
                sx={{
                  opacity: row.is_active ? 1 : 0.5,
                  borderRadius: '8px',
                  mb: 0.5,
                  '&.Mui-selected': {
                    bgcolor: 'rgba(204, 94, 51, 0.12)',
                    '&:hover': { bgcolor: 'rgba(204, 94, 51, 0.18)' },
                  },
                }}
              >
                <ListItemText
                  primary={employeeName(row)}
                  secondary={formatCurrency(row.pay_total ?? 0)}
                  slotProps={{
                    primary: { sx: { fontWeight: 600, color: '#1A202C' } },
                    secondary: { sx: { color: '#CC5E33', fontWeight: 600 } },
                  }}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Paper>

      <Paper sx={{ flex: 1, p: 3, minHeight: 360, opacity: selected && selected.is_active === false ? 0.85 : 1 }}>
        {!selectedId ? (
          <Typography sx={{ color: '#718096' }}>
            Сотрудников заводят в разделе Пользователи
          </Typography>
        ) : detailLoading && !detail ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
        ) : !detail ? (
          <Typography sx={{ color: '#718096' }}>Не удалось загрузить карточку</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>{employeeName(detail)}</Typography>
              {detail.is_active === false && <Chip size="small" label="Неактивен" />}
            </Box>
            <Typography variant="body2" sx={{ color: '#718096', mt: -1 }}>
              {roleOrTitle}
              {detail.username ? ` · ${detail.username}` : ''}
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Телефон"
                value={profile.phone}
                onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
                onBlur={() => persist('profile')}
              />
              <TextField
                label="День рождения"
                type="date"
                value={profile.birthday}
                onChange={(event) => setProfile((prev) => ({ ...prev, birthday: event.target.value }))}
                onBlur={() => persist('profile')}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
            <TextField
              label="Заметка"
              value={profile.notes}
              onChange={(event) => setProfile((prev) => ({ ...prev, notes: event.target.value }))}
              onBlur={() => persist('profile')}
              multiline
              minRows={2}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Ставка часа"
                type="number"
                value={profile.hourly_rate}
                onChange={(event) => setProfile((prev) => ({ ...prev, hourly_rate: event.target.value }))}
                onBlur={() => persist('profile')}
                slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              />
              <TextField
                label="Процент с продаж"
                type="number"
                value={profile.commission_percent}
                onChange={(event) => setProfile((prev) => ({ ...prev, commission_percent: event.target.value }))}
                onBlur={() => persist('profile')}
                slotProps={{ htmlInput: { min: 0, max: 100, step: '0.01' } }}
              />
            </Box>
            <Typography variant="caption" sx={{ color: '#718096', mt: -1 }}>
              Ставка и процент выше — текущие в профиле.
              {rateSource === 'month'
                ? ` Для расчёта этого месяца зафиксированы ${formatCurrency(monthInfo.hourly_rate)} / час и ${toNum(monthInfo.commission_percent)}%.`
                : ' Месяц ещё не сохраняли — в расчёт берутся ставка и процент из профиля.'}
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Часы за месяц"
                type="number"
                value={monthForm.hours}
                onChange={(event) => setMonthForm((prev) => ({ ...prev, hours: event.target.value }))}
                onBlur={() => persist('month')}
                slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              />
              <TextField
                label="Бонус"
                type="number"
                value={monthForm.bonus}
                onChange={(event) => setMonthForm((prev) => ({ ...prev, bonus: event.target.value }))}
                onBlur={() => persist('month')}
                slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              />
            </Box>

            <Box sx={{ bgcolor: '#F7FAFC', borderRadius: 2, p: 2 }}>
              <Typography variant="body2" sx={{ color: '#4A5568' }}>
                {hours} ч × {formatCurrency(rate)} = {formatCurrency(hoursPay)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#4A5568' }}>
                {percent}% × {formatCurrency(sales)} = {formatCurrency(salesPay)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#4A5568' }}>
                Бонус {formatCurrency(bonus)}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1, color: '#1A202C' }}>
                Итого {formatCurrency(livePay)}
              </Typography>
            </Box>

            {(profileDirty || monthDirty) && (
              <Box>
                <Button variant="contained" onClick={() => persist('all', { toast: true })} disabled={saving}>
                  {saving ? <CircularProgress size={22} /> : 'Сохранить'}
                </Button>
              </Box>
            )}

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Отпуска / отгулы</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    onClick={() => openLeave('vacation')}
                    sx={{ textTransform: 'none' }}
                  >
                    + отпуск
                  </Button>
                  <Button
                    size="small"
                    onClick={() => openLeave('time_off')}
                    sx={{ textTransform: 'none' }}
                  >
                    + отгул
                  </Button>
                </Box>
              </Box>
              {(detail.leaves || []).length === 0 ? (
                <Typography variant="body2" sx={{ color: '#718096' }}>Нет отсутствий в этом месяце</Typography>
              ) : (
                (detail.leaves || []).map((item) => (
                  <Box
                    key={item.id}
                    component="button"
                    type="button"
                    onClick={() => openLeave(item.kind, item)}
                    sx={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      bgcolor: 'transparent',
                      cursor: 'pointer',
                      py: 0.75,
                      px: 0,
                      fontFamily: 'inherit',
                      '&:hover': { color: '#CC5E33' },
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'inherit' }}>
                      {KIND_LABELS[item.kind] || item.kind} {formatIsoRange(item.date_from, item.date_to)}
                    </Typography>
                    {item.comment ? (
                      <Typography variant="caption" sx={{ color: '#718096' }}>{item.comment}</Typography>
                    ) : null}
                  </Box>
                ))
              )}
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
