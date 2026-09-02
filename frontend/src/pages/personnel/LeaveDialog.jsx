import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../../api';
import { useFeedback } from '../../hooks/useFeedback';
import SearchableSelect from '../../components/SearchableSelect';
import { extractApiError } from '../../utils';

const KIND_OPTIONS = [
  { value: 'vacation', label: 'Отпуск' },
  { value: 'time_off', label: 'Отгул' },
];

const KIND_LABELS = {
  vacation: 'отпуск',
  time_off: 'отгул',
};

const emptyForm = {
  user: '',
  kind: 'vacation',
  date_from: '',
  date_to: '',
  comment: '',
};

const userIdOf = (leave) => leave?.user?.id ?? leave?.user ?? '';

const formFromLeave = (leave) => ({
  user: userIdOf(leave),
  kind: leave.kind || 'vacation',
  date_from: leave.date_from || '',
  date_to: leave.date_to || '',
  comment: leave.comment || '',
});

const formFromPreset = (preset) => ({
  ...emptyForm,
  user: preset?.user || '',
  kind: preset?.kind || 'vacation',
  date_from: preset?.date_from || '',
  date_to: preset?.date_to || '',
  comment: preset?.comment || '',
});

const countWorkingDays = (fromStr, toStr) => {
  if (!fromStr || !toStr || toStr < fromStr) return 0;
  const [fY, fM, fD] = fromStr.split('-').map(Number);
  const [tY, tM, tD] = toStr.split('-').map(Number);
  const current = new Date(fY, fM - 1, fD);
  const end = new Date(tY, tM - 1, tD);
  let count = 0;
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

const pluralizeDays = (n) => {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} день`;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} дня`;
  return `${n} дней`;
};

const LeaveDialog = ({
  open,
  onClose,
  onSaved,
  employees = [],
  leave = null,
  preset = null,
}) => {
  const { notify, confirm } = useFeedback();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(leave?.id);

  useEffect(() => {
    if (!open) return;
    setForm(leave ? formFromLeave(leave) : formFromPreset(preset));
    setFormError(null);
  }, [open, leave, preset]);

  const employeeName = (() => {
    const row = employees.find((item) => String(item.id) === String(form.user));
    if (row) {
      const name = `${row.last_name || ''} ${row.first_name || ''}`.trim();
      return name || row.username || `Сотрудник #${row.id}`;
    }
    if (leave?.user) {
      const name = `${leave.user.last_name || ''} ${leave.user.first_name || ''}`.trim();
      return name || leave.user.username || `Сотрудник #${form.user}`;
    }
    return form.user ? `Сотрудник #${form.user}` : '';
  })();

  const close = () => {
    if (saving) return;
    onClose();
  };

  const save = async () => {
    if (!form.user) {
      setFormError('Выберите сотрудника.');
      return;
    }
    if (!form.kind) {
      setFormError('Укажите тип отсутствия.');
      return;
    }
    if (!form.date_from || !form.date_to) {
      setFormError('Укажите даты начала и окончания.');
      return;
    }
    if (form.date_to < form.date_from) {
      setFormError('Дата окончания не может быть раньше даты начала.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      kind: form.kind,
      date_from: form.date_from,
      date_to: form.date_to,
      comment: form.comment || '',
    };
    try {
      if (editing) {
        await api.patch(`/personnel/leaves/${leave.id}/`, payload);
      } else {
        await api.post('/personnel/leaves/', { ...payload, user: form.user });
      }
      onSaved();
      onClose();
    } catch (err) {
      setFormError(extractApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const label = KIND_LABELS[leave.kind] || 'отсутствие';
    const ok = await confirm(`Удалить ${label}?`);
    if (!ok) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.delete(`/personnel/leaves/${leave.id}/`);
      onSaved();
      onClose();
    } catch (err) {
      setFormError(extractApiError(err));
      notify(`Не удалось удалить:\n${extractApiError(err)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? 'Отсутствие' : 'Новое отсутствие'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {formError && (
          <Alert severity="error" role="alert" aria-live="assertive">{formError}</Alert>
        )}
        <TextField
          label="Сотрудник"
          value={employeeName}
          disabled
          fullWidth
        />
        <SearchableSelect
          id="personnel-leave-kind"
          label="Тип"
          required
          value={form.kind}
          onChange={(value) => setForm((prev) => ({ ...prev, kind: value }))}
          options={KIND_OPTIONS}
        />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="С"
            type="date"
            required
            fullWidth
            value={form.date_from}
            onChange={(event) => setForm((prev) => ({ ...prev, date_from: event.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="По"
            type="date"
            required
            fullWidth
            value={form.date_to}
            onChange={(event) => setForm((prev) => ({ ...prev, date_to: event.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
        {form.date_from && form.date_to && form.date_to >= form.date_from && (
          <Typography variant="body2" sx={{ color: '#4A5568', textAlign: 'center', mt: -1 }}>
            Продолжительность: <strong>{countWorkingDays(form.date_from, form.date_to)} раб. {pluralizeDays(countWorkingDays(form.date_from, form.date_to)).split(' ')[1]}</strong>
          </Typography>
        )}
        <TextField
          label="Комментарий"
          value={form.comment}
          onChange={(event) => setForm((prev) => ({ ...prev, comment: event.target.value }))}
          multiline
          minRows={2}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        {editing && (
          <Button color="error" onClick={remove} disabled={saving}>Удалить</Button>
        )}
        <Button onClick={close} disabled={saving} color="inherit" sx={{ ml: 'auto' }}>Отмена</Button>
        <Button variant="contained" onClick={save} disabled={saving}>
          {saving ? <CircularProgress size={22} /> : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LeaveDialog;
