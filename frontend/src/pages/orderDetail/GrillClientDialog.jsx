import {
  Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material';

const GrillClientDialog = ({
  open,
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
  onSkip,
}) => (
  <Dialog
    open={open}
    onClose={onClose}
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
        value={form.first_name}
        onChange={(e) => onChange({ ...form, first_name: e.target.value })}
      />
      <TextField
        fullWidth
        size="small"
        label="Фамилия"
        value={form.last_name}
        onChange={(e) => onChange({ ...form, last_name: e.target.value })}
      />
      <TextField
        fullWidth
        size="small"
        required
        label="Телефон"
        value={form.phone}
        onChange={(e) => onChange({ ...form, phone: e.target.value })}
        placeholder="+375..."
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={onSkip} disabled={saving} color="inherit" sx={{ mr: 'auto' }}>
        Без клиента
      </Button>
      <Button onClick={onClose} disabled={saving}>
        Отмена
      </Button>
      <Button variant="contained" disabled={saving} onClick={onSubmit}>
        {saving ? <CircularProgress size={20} color="inherit" /> : 'Сохранить'}
      </Button>
    </DialogActions>
  </Dialog>
);

export default GrillClientDialog;
