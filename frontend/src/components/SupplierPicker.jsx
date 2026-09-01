import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import SearchableSelect from './SearchableSelect';

const supplierLabel = (supplier) => (
  supplier.phone ? `${supplier.name} · ${supplier.phone}` : supplier.name
);

const SupplierPicker = ({
  id = 'supplier-picker',
  suppliers,
  value,
  onChange,
  name,
  phone,
  onNameChange,
  onPhoneChange,
  onAdd,
  adding = false,
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <SearchableSelect
      id={id}
      label="Поставщик"
      placeholder="Выберите поставщика"
      value={value}
      onChange={onChange}
      options={suppliers.map((s) => ({ value: s.id, label: supplierLabel(s) }))}
    />
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      Если поставщика нет в списке — укажите название и телефон
    </Typography>
    <TextField
      fullWidth
      size="small"
      label="Название поставщика"
      value={name}
      onChange={(e) => onNameChange(e.target.value)}
    />
    <TextField
      fullWidth
      size="small"
      label="Телефон поставщика"
      value={phone}
      placeholder="+375..."
      onChange={(e) => onPhoneChange(e.target.value)}
    />
    <Button
      variant="outlined"
      onClick={onAdd}
      disabled={adding || !String(name || '').trim()}
      sx={{ alignSelf: 'flex-start' }}
    >
      {adding ? <CircularProgress size={18} /> : 'Добавить в список'}
    </Button>
  </Box>
);

export default SupplierPicker;
